// FILE: tests/pairing/protocol.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_PROTOCOL_VERSION,
  buildBaseUrl,
  buildPairingUri,
  formatPairingCode,
  isPairingErrorCode,
  isPayloadExpired,
  millisecondsUntilExpiry,
  normalizePairingCode,
  parsePairingUri,
  type PairingPayload,
} from "../../src/lib/pairing/protocol.ts";

const payload: PairingPayload = {
  version: PAIRING_PROTOCOL_VERSION,
  serverId: "9f2c4a1b8d7e6f5a4b3c2d1e0f9a8b7c",
  serverName: "Pavels MacBook Pro",
  host: "192.168.1.42",
  port: 3000,
  mdnsHost: "pavels-macbook-pro.local",
  scheme: "http",
  code: "ABCDEFGHJKMN",
  expiresAt: 1_800_000_000_000,
};

describe("pairing codes", () => {
  it("uses an alphabet with no lookalike characters", () => {
    for (const forbidden of ["0", "1", "I", "L", "O", "U"]) {
      assert.equal(
        PAIRING_CODE_ALPHABET.includes(forbidden),
        false,
        `${forbidden} is too easy to mistype to be in the alphabet`,
      );
    }
  });

  it("accepts a code the way a person types it", () => {
    for (const written of [
      "ABCD-EFGH-JKMN",
      "abcd-efgh-jkmn",
      "ABCDEFGHJKMN",
      "abcd efgh jkmn",
      "  ABCD-EFGH-JKMN  ",
      "AB-CD-EF-GH-JK-MN",
    ]) {
      assert.equal(normalizePairingCode(written), "ABCDEFGHJKMN", `failed on ${written}`);
    }
  });

  it("refuses anything that is not a code", () => {
    for (const bad of [
      "",
      "ABCD-EFGH",
      "ABCD-EFGH-JKMNP",
      "ABCD-EFGH-JKM0", // 0 is not in the alphabet
      "ABCD-EFGH-JKMI", // nor is I
      "!!!!-!!!!-!!!!",
      null,
      undefined,
      12345 as unknown as string,
    ]) {
      assert.equal(normalizePairingCode(bad as string), null, `accepted ${String(bad)}`);
    }
  });

  it("formats a code in readable groups", () => {
    assert.equal(formatPairingCode("ABCDEFGHJKMN"), "ABCD-EFGH-JKMN");
  });

  it("round-trips every generated shape", () => {
    // A code of the documented length always formats and normalizes back.
    const code = PAIRING_CODE_ALPHABET.slice(0, PAIRING_CODE_LENGTH);
    assert.equal(normalizePairingCode(formatPairingCode(code)), code);
  });
});

describe("QR payload", () => {
  it("round-trips through the URI", () => {
    const parsed = parsePairingUri(buildPairingUri(payload));
    assert.equal(parsed.ok, true);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.payload, payload);
  });

  it("survives a server name with spaces and an apostrophe", () => {
    const named = { ...payload, serverName: "Pavel's MacBook Pro (work)" };
    const parsed = parsePairingUri(buildPairingUri(named));
    assert.ok(parsed.ok);
    assert.equal(parsed.payload.serverName, "Pavel's MacBook Pro (work)");
  });

  it("keeps working when the computer has no .local name", () => {
    const parsed = parsePairingUri(buildPairingUri({ ...payload, mdnsHost: null }));
    assert.ok(parsed.ok);
    assert.equal(parsed.payload.mdnsHost, null);
  });

  it("rejects a QR that is not ours", () => {
    for (const other of [
      "https://example.com",
      "WIFI:S:HomeNet;T:WPA;P:hunter2;;",
      "",
      "cadence://something-else?v=1",
      "4006000000000000",
    ]) {
      const parsed = parsePairingUri(other);
      assert.equal(parsed.ok, false);
      assert.ok(!parsed.ok);
      assert.equal(parsed.reason, "not_a_pairing_uri", `wrong reason for ${other}`);
    }
  });

  it("names the version mismatch in the direction the app can explain", () => {
    const newer = parsePairingUri(buildPairingUri({ ...payload, version: 99 }));
    assert.ok(!newer.ok);
    assert.equal(newer.reason, "server_too_new");

    const older = parsePairingUri(buildPairingUri({ ...payload, version: 1 }), 5);
    assert.ok(!older.ok);
    assert.equal(older.reason, "server_too_old");
  });

  it("rejects a payload missing anything it needs", () => {
    const base = buildPairingUri(payload);

    for (const dropped of ["id", "host", "port", "code", "exp"]) {
      const url = new URL(base.replace("cadence://pair", "http://pair"));
      url.searchParams.delete(dropped);
      const parsed = parsePairingUri(url.toString().replace("http://pair", "cadence://pair"));
      assert.equal(parsed.ok, false, `accepted a payload with no ${dropped}`);
      assert.ok(!parsed.ok);
      assert.equal(parsed.reason, "malformed");
    }
  });

  it("rejects an impossible port", () => {
    for (const port of ["0", "70000", "-1", "abc", "3000.5"]) {
      const uri = buildPairingUri(payload).replace("port=3000", `port=${port}`);
      const parsed = parsePairingUri(uri);
      assert.equal(parsed.ok, false, `accepted port ${port}`);
    }
  });

  it("rejects a scheme it does not speak", () => {
    const uri = buildPairingUri(payload).replace("scheme=http", "scheme=ftp");
    assert.equal(parsePairingUri(uri).ok, false);
  });
});

describe("expiry", () => {
  it("is expired exactly at the deadline, not a millisecond later", () => {
    assert.equal(isPayloadExpired(payload, payload.expiresAt - 1), false);
    assert.equal(isPayloadExpired(payload, payload.expiresAt), true);
    assert.equal(isPayloadExpired(payload, payload.expiresAt + 1), true);
  });

  it("never counts down past zero", () => {
    assert.equal(millisecondsUntilExpiry(payload, payload.expiresAt - 5_000), 5_000);
    assert.equal(millisecondsUntilExpiry(payload, payload.expiresAt), 0);
    assert.equal(millisecondsUntilExpiry(payload, payload.expiresAt + 60_000), 0);
  });
});

describe("base URLs", () => {
  it("builds what the phone will fetch", () => {
    assert.equal(
      buildBaseUrl({ scheme: "http", host: "192.168.1.42", port: 3000 }),
      "http://192.168.1.42:3000",
    );
    assert.equal(
      buildBaseUrl({ scheme: "http", host: "my-mac.local", port: 3130 }),
      "http://my-mac.local:3130",
    );
  });

  it("brackets an IPv6 literal", () => {
    assert.equal(
      buildBaseUrl({ scheme: "http", host: "fe80::1", port: 3000 }),
      "http://[fe80::1]:3000",
    );
  });
});

describe("error codes", () => {
  it("recognizes the codes both sides agree on", () => {
    assert.equal(isPairingErrorCode("code_expired"), true);
    assert.equal(isPairingErrorCode("device_revoked"), true);
    assert.equal(isPairingErrorCode("something_else"), false);
    assert.equal(isPairingErrorCode(null), false);
  });
});

describe("the server and the phone hold the same contract", () => {
  it("has identical module bodies", () => {
    // The two copies differ only in the header comment. If they drift, a phone
    // and a computer can disagree about what a QR means, which is exactly the
    // bug this test exists to prevent.
    const body = (path: string) => {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      const start = source.indexOf("/**");
      assert.notEqual(start, -1, `no body found in ${path}`);
      return source.slice(start);
    };

    assert.equal(
      body("../../src/lib/pairing/protocol.ts"),
      body("../../mobile/src/pairing/protocol.ts"),
      "src/lib/pairing/protocol.ts and mobile/src/pairing/protocol.ts have drifted apart",
    );
  });
});
