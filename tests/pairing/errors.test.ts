// FILE: tests/pairing/errors.test.ts
//
// The product rule this file enforces: every way connecting can fail has a
// sentence that names the cause, and none of them is a spinner.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeFailure,
  failureFromParseFailure,
  failureFromServerCode,
  failureFromTransportError,
  type ConnectionFailure,
} from "../../mobile/src/pairing/errors.ts";

const ALL_FAILURES: ConnectionFailure[] = [
  "server_unreachable",
  "offline",
  "cellular_only",
  "wrong_server",
  "device_revoked",
  "token_expired",
  "server_too_new",
  "server_too_old",
  "local_network_denied",
  "camera_denied",
  "code_expired",
  "code_already_used",
  "code_not_found",
  "code_malformed",
  "not_a_pairing_code",
  "unknown",
];

describe("every failure is explainable", () => {
  for (const failure of ALL_FAILURES) {
    it(`explains ${failure}`, () => {
      const message = describeFailure(failure);

      assert.ok(message.title.length > 0, "needs a title");
      assert.ok(message.body.length > 10, "needs a body worth reading");

      // No jargon, and nothing that reads like a stack trace.
      for (const banned of ["undefined", "null", "Error:", "ECONN", "500", "fetch"]) {
        assert.equal(
          message.title.includes(banned) || message.body.includes(banned),
          false,
          `${failure} leaks "${banned}" to the person`,
        );
      }

      // An action kind of "none" is the only case allowed to have no button,
      // because there is genuinely nothing to press.
      if (message.actionKind === "none") {
        assert.equal(message.action, null);
      } else {
        assert.ok(message.action, `${failure} promises an action but names no label`);
      }
    });
  }

  it("says what is wrong, not that something is wrong, when the computer is off", () => {
    const message = describeFailure("server_unreachable");
    assert.match(message.title, /not running on your computer/);
    assert.equal(message.actionKind, "retry");
  });

  it("sends the person to Settings when iOS blocked the local network", () => {
    const message = describeFailure("local_network_denied");
    assert.equal(message.actionKind, "settings");
    assert.match(message.body, /Local Network/);
  });

  it("offers re-pairing, not a retry, when the phone was unpaired", () => {
    assert.equal(describeFailure("device_revoked").actionKind, "rescan");
    assert.equal(describeFailure("token_expired").actionKind, "rescan");
  });

  it("does not offer a pointless retry when the app is simply too old", () => {
    assert.equal(describeFailure("server_too_new").actionKind, "none");
  });

  it("falls back to something usable for an unknown failure", () => {
    const message = describeFailure("nonsense" as ConnectionFailure);
    assert.equal(message.title, describeFailure("unknown").title);
  });
});

describe("mapping server codes", () => {
  it("maps each protocol code to the matching failure", () => {
    assert.equal(failureFromServerCode("code_expired"), "code_expired");
    assert.equal(failureFromServerCode("code_already_used"), "code_already_used");
    assert.equal(failureFromServerCode("code_not_found"), "code_not_found");
    assert.equal(failureFromServerCode("invalid_request"), "code_malformed");
    assert.equal(failureFromServerCode("device_revoked"), "device_revoked");
    assert.equal(failureFromServerCode("token_expired"), "token_expired");
  });

  it("turns a version mismatch into the side the person can fix from here", () => {
    assert.equal(failureFromServerCode("protocol_version_mismatch"), "server_too_old");
  });

  it("falls back for a code it has never seen", () => {
    assert.equal(failureFromServerCode("teapot"), "unknown");
    assert.equal(failureFromServerCode(null), "unknown");
  });
});

describe("mapping QR parse failures", () => {
  it("distinguishes the wrong kind of QR from a damaged one", () => {
    assert.equal(failureFromParseFailure("not_a_pairing_uri"), "not_a_pairing_code");
    assert.equal(failureFromParseFailure("malformed"), "code_malformed");
  });

  it("carries version mismatches straight through", () => {
    assert.equal(failureFromParseFailure("server_too_new"), "server_too_new");
    assert.equal(failureFromParseFailure("server_too_old"), "server_too_old");
  });
});

describe("mapping transport errors", () => {
  const error = new Error("Network request failed");

  it("blames the network before the computer when the phone is offline", () => {
    assert.equal(
      failureFromTransportError(error, { hasNetwork: false, isWifi: false }),
      "offline",
    );
  });

  it("explains cellular rather than letting it look like a dead computer", () => {
    assert.equal(
      failureFromTransportError(error, { hasNetwork: true, isWifi: false }),
      "cellular_only",
    );
  });

  it("blames the computer when the phone is on Wi-Fi", () => {
    assert.equal(
      failureFromTransportError(error, { hasNetwork: true, isWifi: true }),
      "server_unreachable",
    );
  });

  it("treats a refused local network permission as the real cause", () => {
    // React Native reports this identically to a dead server, so the caller has
    // to tell us; otherwise the person is sent to restart a computer that is
    // running fine.
    assert.equal(
      failureFromTransportError(error, {
        hasNetwork: true,
        isWifi: true,
        localNetworkDenied: true,
      }),
      "local_network_denied",
    );
  });

  it("treats a timeout as an unreachable computer", () => {
    const aborted = new Error("timeout");
    aborted.name = "AbortError";
    assert.equal(
      failureFromTransportError(aborted, { hasNetwork: true, isWifi: true }),
      "server_unreachable",
    );
  });
});
