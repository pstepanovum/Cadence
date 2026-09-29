# Connect your phone to Cadence on your computer

Cadence can run entirely on your own computer. Your phone talks to it over your
home Wi-Fi, which means your voice never leaves your house and there is nothing
to pay for.

You do this once. After that your phone finds your computer on its own.

**You will need:** your computer, your phone, and both on the same Wi-Fi.

---

## Step 1 — Start Cadence on your computer

**If you have the Cadence app:** open it, then choose **Phone → Connect a
Phone** from the menu at the top of the screen.

The first time, Cadence asks whether to let your phone connect. Choose **Turn On
and Reopen**. Cadence closes and opens again — that is expected.

**If you run Cadence with Docker:** open Terminal and run

```
pnpm serve
```

The first run downloads the speech models and can take a while. Leave it be;
it tells you when it is ready.

## Step 2 — You will see a square code

A black-and-white square appears, along with a 12-character code underneath it
like `27E4-GZYD-N8Y9`.

That code lasts **two minutes** and works **once**. If it runs out, press Enter
(in Terminal) or **Show a new code** (in the app) and you get a fresh one. There
is no harm in doing that as many times as you like.

## Step 3 — On your phone

Open Cadence and tap **Connect to my computer**, then **Scan the code**.

Point the camera at the square on your computer screen.

Your phone will ask for permission to use the camera, and then for permission to
find things on your local network. **Both are needed.** The second one is how
your phone is allowed to talk to your computer at all.

That is it. Your phone says which computer it is connected to, and you can
start practising.

---

## Later on

You do not scan anything again. When you open Cadence on your phone it looks for
your computer by itself, as long as:

- your computer is awake, and
- Cadence is running on it, and
- both are on the same Wi-Fi.

If your computer was asleep, open Cadence on your phone again after the computer
wakes up. It reconnects within a few seconds.

---

## When something is not working

Cadence tries to tell you which of these it is, rather than spinning.

**"Cadence is not running on your computer"**
Your computer is asleep, or Cadence is closed on it. Wake the computer, open
Cadence there, and tap **Try again** on your phone.

**"This phone is not on Wi-Fi" or "You are on mobile data"**
Your computer can only be reached over Wi-Fi, never over mobile data. Join the
same Wi-Fi as your computer. This also happens away from home — that is normal,
and it works again when you get back.

**"Cadence cannot see your local network"**
You said no to the local-network permission, and iOS will not ask twice. Open
**Settings → Cadence → Local Network** and turn it on, then tap **Try again**.

**"That code has expired" or "That code was already used"**
Each code lasts two minutes and works once. Get a new one on your computer and
scan again.

**"That is a different computer"**
Something else answered at the address your phone remembered. If you have moved
to a new computer, tap **Pair again** and scan a fresh code.

**"This phone was unpaired"**
Somebody removed this phone from the list on the computer. Scan a new code to
connect again.

**"Update Cadence on your computer"** / **"Update Cadence on your phone"**
The two are different versions and cannot talk. Update the one it names.

**The camera will not scan the square**
Tap **Type the code instead**. Your computer's pairing screen shows an address
(like `192.168.1.42:3000`) and the 12-character code. Type both.

**Nothing works and you want to start over**
On the computer's pairing screen, press **Unpair** next to your phone. Then pair
again from the beginning.

---

## Removing a phone

The pairing screen on your computer lists every phone connected to it, when it
was paired, and when it last checked in. Press **Unpair** next to one and it
stops working immediately — no waiting, no restart.

Do that if you lose your phone, or lend it to someone, or simply stop using it.

---

## What this does and does not protect

Worth knowing, in plain terms.

**Your practice stays at home.** Your recordings are scored on your computer and
never sent to us or anyone else.

**Only phones you paired can connect.** A code has to be scanned or typed within
two minutes, and each one works once.

**Traffic on your own Wi-Fi is not encrypted.** Someone already on your Wi-Fi,
who also knows how to intercept traffic on it, could see your practice
recordings and your progress. There is no account, no password and no payment
detail on this connection — but it is not private from someone already inside
your network. On a home Wi-Fi with a password, that is a small risk; on a café
or office network it is not, so do not run this there.

**Cadence is reachable from your Wi-Fi while it is running.** In the desktop app
that only happens after you turn phone connections on, and you can turn it off
again from **Phone → Stop Sharing With Phones**.

---

## Using the hosted service instead

If you would rather not run anything on your computer, Cadence also offers a
hosted service with an account and synced progress. On the phone's setup screen
choose **Use Cadence Cloud** instead of **Connect to my computer**. You can
change your mind later from the Profile tab.
