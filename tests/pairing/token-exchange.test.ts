// FILE: tests/pairing/token-exchange.test.ts
//
// The rules that make pairing safe: a code works once, a code expires, a
// revoked device is gone, and the stored form of a token is a digest rather
// than the token. These are the tests that matter most, because every one of
// them is a way someone could get into a stranger's computer.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEVICE_TOKEN_PREFIX,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_MS,
  PAIRING_PROTOCOL_VERSION,
} from "../../src/lib/pairing/protocol.ts";
import {
  adminTokenMatches,
  authenticateDeviceToken,
  claimPairingCode,
  digestToken,
  generateDeviceToken,
  generatePairingCode,
  issuePairingCode,
  listDevices,
  looksLikeDeviceToken,
  pruneCodes,
  revokeDevice,
} from "../../src/lib/pairing/service-logic.ts";
import type { PairingState } from "../../src/lib/pairing/store.ts";

const NOW = 1_800_000_000_000;

function freshState(): PairingState {
  return {
    version: 1,
    serverId: "server-under-test",
    adminToken: "admin-token-under-test",
    codes: [],
    devices: [],
    profile: { id: "local-paired-test", displayName: "Local learner", createdAt: "2026-01-01" },
  };
}

function iphone() {
  return { name: "Pavel's iPhone", platform: "ios", model: "iPhone17,1" };
}

describe("generated secrets", () => {
  it("emits pairing codes only from the safe alphabet", () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generatePairingCode();
      assert.equal(code.length, PAIRING_CODE_LENGTH);
      for (const character of code) {
        assert.ok(
          PAIRING_CODE_ALPHABET.includes(character),
          `${character} is not in the pairing alphabet`,
        );
      }
    }
  });

  it("does not repeat a pairing code", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      seen.add(generatePairingCode());
    }
    assert.equal(seen.size, 500, "a generated code collided, which should be astronomically rare");
  });

  it("marks device tokens so they cannot be confused with a Supabase JWT", () => {
    const token = generateDeviceToken();
    assert.ok(token.startsWith(DEVICE_TOKEN_PREFIX));
    assert.equal(looksLikeDeviceToken(token), true);
    assert.equal(looksLikeDeviceToken("eyJhbGciOiJIUzI1NiJ9.e30.x"), false);
    assert.equal(looksLikeDeviceToken(null), false);
    assert.equal(looksLikeDeviceToken(undefined), false);
  });

  it("gives every token a distinct digest", () => {
    const one = generateDeviceToken();
    const two = generateDeviceToken();
    assert.notEqual(one, two);
    assert.notEqual(digestToken(one), digestToken(two));
    assert.equal(digestToken(one), digestToken(one));
    assert.equal(digestToken(one).length, 64, "sha-256 hex is 64 characters");
  });
});

describe("issuing a code", () => {
  it("expires two minutes out", () => {
    const state = freshState();
    const { result } = issuePairingCode(state, NOW);
    assert.equal(result.expiresAt, NOW + PAIRING_CODE_TTL_MS);
    assert.equal(result.usedAt, null);
  });

  it("replaces the previous code rather than leaving two live", () => {
    const state = freshState();
    const first = issuePairingCode(state, NOW).result;
    const second = issuePairingCode(state, NOW).result;

    assert.equal(state.codes.length, 1, "only one code may be redeemable at a time");
    assert.equal(state.codes[0].code, second.code);
    assert.notEqual(first.code, second.code);
  });

  it("drops codes that can never be redeemed again", () => {
    const state = freshState();
    state.codes = [
      { code: "AAAAAAAAAAAA", createdAt: 0, expiresAt: NOW - 1, usedAt: null, usedByDeviceId: null },
      { code: "BBBBBBBBBBBB", createdAt: 0, expiresAt: NOW + 1, usedAt: NOW, usedByDeviceId: "d" },
      { code: "CCCCCCCCCCCC", createdAt: 0, expiresAt: NOW + 10_000, usedAt: null, usedByDeviceId: null },
    ];

    assert.equal(pruneCodes(state, NOW), true);
    assert.deepEqual(
      state.codes.map((entry) => entry.code),
      ["CCCCCCCCCCCC"],
    );
  });
});

describe("claiming a code", () => {
  it("exchanges a live code for a device token", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;

    const { result, changed } = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      NOW + 1_000,
    );

    assert.equal(changed, true);
    assert.ok(result.ok);
    assert.ok(result.value.deviceToken.startsWith(DEVICE_TOKEN_PREFIX));
    assert.equal(state.devices.length, 1);
    assert.equal(state.devices[0].name, "Pavel's iPhone");
    assert.equal(state.devices[0].revokedAt, null);
  });

  it("stores only the digest, never the token", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;
    const result = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      NOW,
    ).result;

    assert.ok(result.ok);
    const serialized = JSON.stringify(state);
    assert.equal(
      serialized.includes(result.value.deviceToken),
      false,
      "the device token must never be written into the state file",
    );
    assert.equal(state.devices[0].tokenDigest, digestToken(result.value.deviceToken));
  });

  it("refuses the same code a second time", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;

    const first = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      NOW,
    ).result;
    assert.ok(first.ok);

    const second = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      NOW + 1,
    ).result;

    assert.equal(second.ok, false);
    assert.ok(!second.ok);
    // The code is pruned once redeemed, so the honest answer is "not found".
    assert.ok(["code_already_used", "code_not_found"].includes(second.code));
    assert.equal(state.devices.length, 1, "a replay must not mint a second device");
  });

  it("refuses a code past its expiry", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;

    const outcome = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      NOW + PAIRING_CODE_TTL_MS,
    ).result;

    assert.ok(!outcome.ok);
    assert.equal(outcome.code, "code_expired");
    assert.equal(state.devices.length, 0);
  });

  it("accepts a code right up to the last millisecond", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;

    const outcome = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      NOW + PAIRING_CODE_TTL_MS - 1,
    ).result;

    assert.ok(outcome.ok);
  });

  it("refuses a code that was never issued", () => {
    const state = freshState();
    issuePairingCode(state, NOW);

    const outcome = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code: "ZZZZZZZZZZZZ", device: iphone() },
      NOW,
    ).result;

    assert.ok(!outcome.ok);
    assert.equal(outcome.code, "code_not_found");
  });

  it("accepts a code the person typed with dashes and lower case", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;
    const typed = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`.toLowerCase();

    const outcome = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code: typed, device: iphone() },
      NOW,
    ).result;

    assert.ok(outcome.ok);
  });

  it("refuses a protocol version it does not speak, and says which side is old", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;

    const newerPhone = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION + 1, code, device: iphone() },
      NOW,
    ).result;
    assert.ok(!newerPhone.ok);
    assert.equal(newerPhone.code, "protocol_version_mismatch");
    assert.match(newerPhone.message, /computer/);

    const olderPhone = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION - 1, code, device: iphone() },
      NOW,
    ).result;
    assert.ok(!olderPhone.ok);
    assert.equal(olderPhone.code, "protocol_version_mismatch");
    assert.match(olderPhone.message, /app/);

    assert.equal(state.codes[0].usedAt, null, "a rejected claim must not burn the code");
  });

  it("refuses a device that will not say what it is", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;

    for (const device of [
      { name: "", platform: "ios" },
      { name: "   ", platform: "ios" },
      { name: "Phone", platform: "" },
    ]) {
      const outcome = claimPairingCode(
        state,
        { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device },
        NOW,
      ).result;
      assert.ok(!outcome.ok);
      assert.equal(outcome.code, "invalid_request");
    }
  });

  it("truncates an absurdly long device name instead of storing it", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;

    claimPairingCode(
      state,
      {
        protocolVersion: PAIRING_PROTOCOL_VERSION,
        code,
        device: { name: "x".repeat(5_000), platform: "ios", model: "y".repeat(5_000) },
      },
      NOW,
    );

    assert.equal(state.devices[0].name.length, 64);
    assert.equal(state.devices[0].model?.length, 64);
  });

  it("lets two phones pair, each with its own code and token", () => {
    const state = freshState();

    const firstCode = issuePairingCode(state, NOW).result.code;
    const first = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code: firstCode, device: iphone() },
      NOW,
    ).result;

    const secondCode = issuePairingCode(state, NOW + 1).result.code;
    const second = claimPairingCode(
      state,
      {
        protocolVersion: PAIRING_PROTOCOL_VERSION,
        code: secondCode,
        device: { name: "iPad", platform: "ios", model: "iPad14,3" },
      },
      NOW + 2,
    ).result;

    assert.ok(first.ok);
    assert.ok(second.ok);
    assert.notEqual(first.value.deviceToken, second.value.deviceToken);
    assert.equal(listDevices(state).length, 2);
  });
});

describe("authenticating a device token", () => {
  function pairOne(state: PairingState, at = NOW) {
    const code = issuePairingCode(state, at).result.code;
    const outcome = claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      at,
    ).result;
    assert.ok(outcome.ok);
    return outcome.value;
  }

  it("accepts the token it issued", () => {
    const state = freshState();
    const { deviceToken, device } = pairOne(state);

    const outcome = authenticateDeviceToken(state, deviceToken, NOW + 1_000).result;
    assert.ok(outcome.ok);
    assert.equal(outcome.value.deviceId, device.deviceId);
  });

  it("refuses a token it never issued", () => {
    const state = freshState();
    pairOne(state);

    const outcome = authenticateDeviceToken(state, generateDeviceToken(), NOW).result;
    assert.ok(!outcome.ok);
    assert.equal(outcome.code, "device_revoked");
  });

  it("refuses a token past its expiry", () => {
    const state = freshState();
    const { deviceToken, device } = pairOne(state);

    const outcome = authenticateDeviceToken(state, deviceToken, device.expiresAt).result;
    assert.ok(!outcome.ok);
    assert.equal(outcome.code, "token_expired");
  });

  it("refuses a revoked device immediately", () => {
    const state = freshState();
    const { deviceToken, device } = pairOne(state);

    const revoked = revokeDevice(state, device.deviceId, NOW + 10).result;
    assert.ok(revoked.ok);

    const outcome = authenticateDeviceToken(state, deviceToken, NOW + 20).result;
    assert.ok(!outcome.ok);
    assert.equal(outcome.code, "device_revoked");
    assert.equal(listDevices(state).length, 0);
  });

  it("leaves no trace of a revoked device's token", () => {
    const state = freshState();
    const { device } = pairOne(state);
    const digest = state.devices[0].tokenDigest;

    revokeDevice(state, device.deviceId, NOW);

    assert.equal(
      JSON.stringify(state).includes(digest),
      false,
      "revoking must remove the digest, not merely flag it",
    );
  });

  it("does not rewrite the file on every request", () => {
    const state = freshState();
    const { deviceToken } = pairOne(state);

    // A burst of calls a few seconds apart should not each mark the state dirty.
    assert.equal(authenticateDeviceToken(state, deviceToken, NOW + 5_000).changed, false);
    assert.equal(authenticateDeviceToken(state, deviceToken, NOW + 10_000).changed, false);
    // Past a minute, liveness is worth persisting.
    assert.equal(authenticateDeviceToken(state, deviceToken, NOW + 120_000).changed, true);
  });

  it("reports nothing for a device that is not there", () => {
    const state = freshState();
    const outcome = revokeDevice(state, "no-such-device", NOW).result;
    assert.equal(outcome.ok, false);
  });
});

describe("the pairing screen's key", () => {
  it("accepts the right key and nothing else", () => {
    assert.equal(adminTokenMatches("secret", "secret"), true);
    assert.equal(adminTokenMatches("secret", "Secret"), false);
    assert.equal(adminTokenMatches("secret", "secret "), false);
    assert.equal(adminTokenMatches("secret", ""), false);
    assert.equal(adminTokenMatches("secret", null), false);
    assert.equal(adminTokenMatches("secret", undefined), false);
  });
});

describe("the device list", () => {
  it("shows the newest pairing first and hides revoked ones", () => {
    const state = freshState();

    for (const [index, name] of ["oldest", "middle", "newest"].entries()) {
      const code = issuePairingCode(state, NOW + index).result.code;
      claimPairingCode(
        state,
        { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: { name, platform: "ios" } },
        NOW + index,
      );
    }

    assert.deepEqual(
      listDevices(state).map((device) => device.name),
      ["newest", "middle", "oldest"],
    );

    revokeDevice(state, state.devices[1].deviceId, NOW + 100);

    assert.deepEqual(
      listDevices(state).map((device) => device.name),
      ["newest", "oldest"],
    );
  });

  it("reports times as ISO strings a UI can format", () => {
    const state = freshState();
    const code = issuePairingCode(state, NOW).result.code;
    claimPairingCode(
      state,
      { protocolVersion: PAIRING_PROTOCOL_VERSION, code, device: iphone() },
      NOW,
    );

    const [device] = listDevices(state);
    assert.equal(device.pairedAt, new Date(NOW).toISOString());
    assert.equal(device.lastSeenAt, new Date(NOW).toISOString());
  });
});
