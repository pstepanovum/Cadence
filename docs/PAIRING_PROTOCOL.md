# Phone pairing protocol

Version **1**.

This describes how the Cadence phone app connects to a Cadence server running on
someone's own computer, over their own Wi-Fi, with no hosting bill and no cloud
account. It is the contract; if you change anything in it, bump
`PAIRING_PROTOCOL_VERSION` and update both copies of `protocol.ts`.

- `src/lib/pairing/protocol.ts` — the server's copy
- `mobile/src/pairing/protocol.ts` — the phone's copy
- `tests/pairing/protocol.test.ts` fails if the two drift apart

## The shape of it

```
   Computer (docker compose or the desktop app)          Phone
   ───────────────────────────────────────────           ─────
1  pnpm serve  ->  POST /api/pair/code
                   one-time code, 12 chars, 2 min
                   rendered as a QR

2                                          <- camera reads cadence://pair?...

3                  POST /api/pair/claim    <-  { code, protocolVersion, device }
                   code marked used, atomically
                   ->  { deviceToken, deviceId, server }

4                                              deviceToken -> iOS keychain
                                                            (expo-secure-store)

5                  every later request      <-  Authorization: Bearer cdnc_dev_...
```

A pairing code is a **bearer one-time code**; the exchange is the OAuth 2.0
token-endpoint shape reduced to its minimum for a public client with no redirect
(RFC 6749 §4.1 without the browser leg): short-lived credential in, long-lived
opaque bearer token out.

PKCE (RFC 7636) is deliberately **not** used. PKCE binds an authorization
request to the token request that redeems it, and here the phone never makes an
authorization request — the code arrives out of band, on a QR. A challenge and
verifier sent in the same request prove nothing, so adding them would be
security theatre rather than security.

## The QR payload

A `cadence://pair` URI, so that scanning it with the system camera deep-links
into the app (the scheme is already registered in `app.json`), and so a person
can paste it into the manual field if they want to.

```
cadence://pair
  ?v=1                                   protocol version
  &id=<32 hex chars>                     serverId — this install's identity
  &name=Pavels+MacBook+Pro               label shown on the phone
  &host=192.168.1.42                     LAN IPv4, best for the first connect
  &port=3000
  &scheme=http                           see "TLS" below
  &code=27E4GZYDN8Y9                     the one-time code, normalized
  &exp=1790712488117                     absolute expiry, epoch ms
  &mdns=pavels-macbook-pro.local         optional, used for reconnecting
```

Parsing never throws. A camera will hand the app Wi-Fi QRs, URLs and barcodes,
and every rejection has a reason the scanner screen can show:
`not_a_pairing_uri`, `malformed`, `server_too_new`, `server_too_old`.

### Pairing codes

12 characters from `23456789ABCDEFGHJKMNPQRSTVWXYZ` — 30 symbols, every
lookalike pair removed (no `0`/`O`, no `1`/`I`/`L`, no `U`). About 58 bits, which
is far more than a two-minute single-use window needs, and short enough to read
off a screen and type. Displayed as `XXXX-XXXX-XXXX`; accepted in any case, with
or without dashes or spaces.

Generation uses rejection sampling so no symbol is more likely than another.

## Lifetimes and single use

| Thing | Lifetime | Notes |
|---|---|---|
| Pairing code | 2 minutes | One use. Only one is live at a time; showing the screen again replaces it. |
| Device token | 1 year | Revocable at any moment from the pairing screen. |
| Pairing-screen key | forever | Lives in the server's data directory. |
| Admin cookie | 8 hours | What the `?k=` link is traded for. |

Single use is enforced inside one serialized read-modify-write over the state
file: the code is marked used *before* the token is minted, and the store
serializes callers, so a request that arrives while the first is still in flight
is refused rather than issuing a second token. Once redeemed the record is
pruned, so a replay answers `code_not_found` rather than lingering in a state a
future bug could re-honor.

## Tokens at rest

The server stores **SHA-256 of the device token, hex** — never the token. The
digest is the lookup key, so:

- the state file leaking hands over no usable credential
- a wrong token simply misses the map; nothing is compared byte by byte
- revoking deletes the digest, which is the only thing that made the token work

`tests/pairing/token-exchange.test.ts` asserts the raw token never appears in a
serialization of the state, and that a revoked device's digest is gone rather
than flagged.

## TLS: what was chosen, and why

**Plain HTTP on the local network, with iOS's `NSAllowsLocalNetworking`
exception.** Not a self-signed certificate.

This is the least comfortable decision in the design, so here is the whole
reasoning.

A self-signed certificate pinned to the fingerprint in the QR would be the
textbook answer, and the QR already carries a slot for it. It does not work:

- React Native's `fetch` goes through `NSURLSession`. There is no API to accept
  a specific untrusted certificate without a native
  `URLSessionDelegate` — no JS-level pinning, nothing in Expo Go, and a custom
  native module (TrustKit or similar) that this project does not have and that
  would have to be maintained against every SDK bump.
- Unlike a browser, `NSURLSession` offers no "proceed anyway". The request
  simply fails.
- An ATS exception does **not** bypass server-certificate trust evaluation, so
  `NSExceptionAllowsInsecureHTTPLoads` does not rescue it.
- The remaining option is asking a non-technical person to install a CA profile
  in iOS Settings. That is worse than plain HTTP in every way, including
  security: it grants the certificate authority over their entire device.

And a self-signed certificate that nothing verifies is **worse than honest
HTTP**: the padlock implies a guarantee that is not there.

`NSAllowsLocalNetworking` is Apple's own exception for exactly this case. It
permits `http://` to `.local` names and to private and link-local addresses, and
it does **not** open up the public internet. Unlike `NSAllowsArbitraryLoads` it
needs no App Store review justification.

### What that costs, stated plainly

Traffic between the phone and the computer is unencrypted on the local network.
Someone already on the same Wi-Fi, who can also intercept traffic (ARP spoofing;
plain sniffing needs WPA2-PSK plus the pre-shared key, and is not possible under
WPA3-SAE), could read practice audio and lesson progress, and could capture a
device token in flight.

What is *not* at risk: there is no account, no password, no payment detail and
no cloud credential on this path. The device token grants access to one
household's own practice data on their own computer.

### What replaces certificate pinning

`serverId`: 16 random bytes generated once per install, stored in the data
directory, printed in the QR, and returned unauthenticated by
`GET /api/pair/info`.

On every reconnect the phone probes a candidate address, checks the reported
`serverId` against the one it paired with, and **only then** sends its device
token. This is identity continuity, not authentication: it stops the phone
handing its token to whatever happened to take that IP address after a DHCP
reshuffle, which is the realistic failure, and it is why
`buildCandidates` → `probeServer` → `isExpectedServer` → `verifySession` is that
order and not any other.

It does **not** stop someone who was on the Wi-Fi at pairing time and read the
QR. That is documented, not fixed.

`scheme` is in the payload so a future build can serve HTTPS — with a real
certificate, e.g. a `*.ts.net` name from Tailscale, or a proper local CA — by
flipping one field, with no protocol version bump.

## Endpoints

All under `/api/pair`. `Cache-Control: no-store` on every one.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/pair/info` | none | Probe: version, `serverId`, name, whether the engines are ready. |
| POST | `/api/pair/claim` | the one-time code | Exchange a code for a device token. |
| GET | `/api/pair/session` | device token | "Am I still paired?" Called on launch and after a network change. |
| POST | `/api/pair/code` | owner | Mint a QR. |
| GET | `/api/pair/devices` | owner | List paired devices. |
| DELETE | `/api/pair/devices/:id` | owner | Revoke one. |
| GET | `/api/pair/unlock?k=` | the key | Trade the key for the admin cookie, redirect to `/pair`. |

`/api/pair/info` is intentionally unauthenticated. The phone has to be able to
ask "who are you" before it is willing to send a credential, and the response
tells a device already on the LAN nothing it could not learn by connecting.

### Owner authorization

The pairing screen hands out access to the computer, so it cannot be open to
everyone on the Wi-Fi — and the server is bound to the Wi-Fi precisely so a
phone can reach it.

"Is this request from localhost" is not available: Next.js route handlers are not
given the socket's peer address, and behind docker the host's own browser arrives
from the bridge gateway anyway. So the boundary is a **key in the server's data
directory** (`pairing.json` → `adminToken`, or `CADENCE_PAIRING_ADMIN_TOKEN`).
Holding it means having an account on that computer.

It reaches the browser the way Jupyter's token does: `pnpm serve` prints
`http://localhost:3000/pair?k=<key>`, the page redirects into
`/api/pair/unlock`, which sets an httpOnly cookie and 303s back to a clean
`/pair`. The key does not stay in the address bar, in history, or in a
screenshot of the browser chrome.

### Authenticated requests

Device tokens are prefixed `cdnc_dev_` so the server can tell one from a
Supabase JWT without parsing. `getAppSession()` in `src/lib/app-session.ts`
checks for a device token **first** — before the Supabase bearer branch and
before cookies — and returns a local-mode session bound to the server's shared
local profile. Every existing route (`/api/assess`, `/api/transcribe`,
`/api/modules`, `/api/stats`, `/api/sessions`, `/api/ai-coach`, …) therefore
works for a paired phone with no per-route change.

A device token that is ours but revoked or expired returns a session with no
user rather than falling through to cookies, so a stale phone can never land in
some other identity.

## Progress for a paired phone

Local mode keeps learn progress in a browser cookie. A phone has no cookie jar
we control, so `getLocalLearnState` / `writeLocalLearnState` in
`src/lib/local-learn.ts` check for a device token and read and write
`<data dir>/learn-state.json` instead. The format is unchanged; this is purely a
different place to put the same blob.

Consequence, by design: every device paired to one computer shares one progress
state, and the browser on that computer keeps its own. Two phones in a household
practising against the same computer see the same progress.

## Discovery and reconnecting

Candidates, in order (`buildCandidates`):

1. the address that worked last time
2. `<hostname>.local`
3. the IP from the QR

(2) is what makes a new DHCP lease a non-event, and it needs **no mDNS
library**: macOS and most Linux desktops already publish a `.local` record for
themselves, and iOS resolves it natively. That is also why the Bonjour keys
belong in `Info.plist` even though the app browses for no services — the local
network entitlement covers `.local` resolution too.

`_cadence._tcp` is declared in `NSBonjourServices` so that a future build can
browse for the service without another App Store review cycle.

The state machine is `reduce()` in `mobile/src/pairing/discovery.ts`: pure, no
timers, no fetch. Three quiet sweeps (`MAX_SILENT_ATTEMPTS`) before the person
is told anything, because a laptop waking from sleep takes a beat. Backoff is
1s, 2s, 5s, 10s, then 30s. A failure that retrying cannot fix — revoked,
expired, wrong server, app too old — reports `retryInMs: null` rather than
showing a countdown that is a lie.

### iOS keys

In `mobile/app.json`, under `ios.infoPlist`:

- `NSAppTransportSecurity.NSAllowsLocalNetworking` — permits `http://` to local
  addresses and `.local` names. Without it every request fails.
- `NSLocalNetworkUsageDescription` — required since iOS 14 before the app may
  contact anything on the local network, `.local` resolution included. Without
  it the first LAN request fails with a generic network error.
- `NSBonjourServices` — `_cadence._tcp`, `_http._tcp`.

Plus the `expo-camera` plugin, which generates `NSCameraUsageDescription`.

**If the local-network prompt is refused**, iOS reports the failure identically
to a dead server: "Network request failed", no error code, no permission API to
query. `failureFromTransportError` therefore takes the observed network state
from the caller, and the scanner offers "Open Settings" alongside the
manual-code path, which does not depend on the permission for an address typed
by hand… but does still need it to reach that address. So the honest handling is
the one implemented: say what iOS is doing and send the person to Settings.

## Error codes

Both sides agree on these; the phone maps each to a sentence in
`mobile/src/pairing/errors.ts`.

| Code | HTTP | Means |
|---|---|---|
| `invalid_request` | 400 | Malformed body, or a device that would not identify itself. |
| `protocol_version_mismatch` | 409 | One side is too old. The message names which. |
| `code_not_found` | 403 | Wrong code, or one already redeemed and pruned. |
| `code_expired` | 403 | Past the two minutes. |
| `code_already_used` | 403 | Redeemed, not yet pruned. |
| `device_revoked` | 401 | Unpaired from the computer, or a token we never issued. |
| `token_expired` | 401 | Past a year. |
| `unauthorized` | 401 | No device token, or the wrong pairing-screen key. |

## Files

```
src/lib/pairing/
  protocol.ts        the wire contract (mirrored to mobile/)
  service-logic.ts   every decision, pure, over a plain state object
  service.ts         thin filesystem-bound shell
  store.ts           the JSON state file: atomic writes, serialized mutations
  learn-store.ts     paired-device learn progress
  identity.ts        server name, LAN addresses, .local name
  request.ts         request -> paired device
  admin.ts           the owner guard
  qr.ts              SVG and terminal rendering

src/app/api/pair/{info,claim,session,code,devices,unlock}/
src/app/pair/page.tsx + src/components/pair/PairPanel.tsx

mobile/src/pairing/
  protocol.ts        mirror of the server's
  discovery.ts       candidates + the state machine, pure
  errors.ts          every failure -> a sentence, pure
  address.ts         parsing a typed address, pure
  client.ts          probe, claim, verify
  storage.ts         the keychain
  context.tsx        the runtime: timers, fetches, transport publishing
mobile/src/api/transport.ts
mobile/src/app/connect/{index,scan,manual}.tsx
mobile/src/hooks/useServerStatus.ts   reads the connection state for screens

desktop/src/main/pairing.ts    preferences, LAN address, the pairing URL
scripts/serve.mjs              pnpm serve
tests/pairing/*.test.ts        106 tests over the pure parts
```

## Configuration

| Variable | Where | Meaning |
|---|---|---|
| `CADENCE_DATA_DIR` | server | Pairing state and paired-device progress. Default `~/.cadence`. |
| `CADENCE_LAN_HOST` | server | The address to print in the QR. Required in docker, which cannot see the host's Wi-Fi address. |
| `CADENCE_SERVER_NAME` | server | Label shown on the phone. Defaults to the hostname. |
| `CADENCE_PUBLIC_PORT` | server | Port to print. Defaults to `PORT`, then 3000. |
| `CADENCE_MDNS_HOST` | server | Override the `.local` name. |
| `CADENCE_IN_CONTAINER` | server | `1` suppresses the container's meaningless hostname and `.local` name. |
| `CADENCE_PAIRING_ADMIN_TOKEN` | server | Pairing-screen key. Generated into the data directory if unset. |

## What is deliberately not here

- **No mDNS advertising from our own code.** The OS already publishes
  `<hostname>.local`, and a JS mDNS responder would be a dependency and a
  background socket for no gain. `_cadence._tcp` is declared on the phone so a
  future build can browse without another review cycle.
- **No WAN access.** Reaching your computer from outside the house is a
  different problem with a different threat model. Tailscale or a reverse proxy
  solves it and the `scheme` field is ready for the HTTPS that would come with
  it.
- **No per-request signing.** The realistic attacker on a home LAN is not worth
  a bespoke MAC scheme, and inventing one is how crypto bugs happen. If this
  path ever needs confidentiality, the answer is real TLS, not a homemade
  envelope.
