// FILE: tests/pairing/discovery.test.ts
//
// The state machine that decides where to look for the computer and when to
// stop pretending. The cases below are the real ones: the laptop slept, the
// router handed out a new address, the phone left the house, the computer was
// replaced, the phone was unpaired.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_SILENT_ATTEMPTS,
  buildCandidates,
  isExpectedServer,
  reduce,
  rememberGoodAddress,
  retryDelayMs,
  type ConnectionState,
  type StoredConnection,
} from "../../mobile/src/pairing/discovery.ts";
import type { ServerInfo } from "../../mobile/src/pairing/protocol.ts";

const connection: StoredConnection = {
  serverId: "server-abc",
  serverName: "Pavels MacBook Pro",
  host: "192.168.1.42",
  port: 3000,
  mdnsHost: "pavels-macbook-pro.local",
  scheme: "http",
  lastGoodBaseUrl: null,
};

const info: ServerInfo = {
  protocolVersion: 1,
  serverId: "server-abc",
  serverName: "Pavels MacBook Pro",
  appVersion: "0.1.0",
  enginesReady: true,
};

describe("where to look", () => {
  it("tries the .local name before the address from the QR", () => {
    // This is the ordering that makes a new DHCP lease a non-event.
    assert.deepEqual(buildCandidates(connection), [
      "http://pavels-macbook-pro.local:3000",
      "http://192.168.1.42:3000",
    ]);
  });

  it("tries what worked last time first", () => {
    assert.deepEqual(
      buildCandidates({ ...connection, lastGoodBaseUrl: "http://192.168.1.99:3000" }),
      [
        "http://192.168.1.99:3000",
        "http://pavels-macbook-pro.local:3000",
        "http://192.168.1.42:3000",
      ],
    );
  });

  it("does not probe the same address twice", () => {
    const candidates = buildCandidates({
      ...connection,
      lastGoodBaseUrl: "http://192.168.1.42:3000",
    });
    assert.deepEqual(candidates, [
      "http://192.168.1.42:3000",
      "http://pavels-macbook-pro.local:3000",
    ]);
    assert.equal(new Set(candidates).size, candidates.length);
  });

  it("still has somewhere to look when the computer has no .local name", () => {
    assert.deepEqual(buildCandidates({ ...connection, mdnsHost: null }), [
      "http://192.168.1.42:3000",
    ]);
  });

  it("carries a non-default port through every candidate", () => {
    for (const candidate of buildCandidates({ ...connection, port: 3130 })) {
      assert.match(candidate, /:3130$/);
    }
  });
});

describe("is this the right computer", () => {
  it("accepts the server it paired with", () => {
    assert.equal(isExpectedServer(connection, info), true);
  });

  it("refuses a different Cadence install at the same address", () => {
    assert.equal(isExpectedServer(connection, { ...info, serverId: "someone-elses" }), false);
  });
});

describe("backoff", () => {
  it("starts fast and settles down", () => {
    const delays = [0, 1, 2, 3, 4, 5, 20].map(retryDelayMs);
    assert.deepEqual(delays, [1_000, 2_000, 5_000, 10_000, 30_000, 30_000, 30_000]);

    for (let index = 1; index < delays.length; index += 1) {
      assert.ok(delays[index] >= delays[index - 1], "backoff must never get shorter");
    }
  });
});

describe("state transitions", () => {
  const unpaired: ConnectionState = { status: "unpaired" };

  it("lands connected right after pairing", () => {
    const next = reduce(unpaired, { type: "paired", connection });
    assert.equal(next.status, "connected");
    assert.ok(next.status === "connected");
    assert.equal(next.baseUrl, "http://192.168.1.42:3000");
    assert.equal(next.serverName, "Pavels MacBook Pro");
    // The engines may still be loading models; the UI says so rather than
    // pretending scoring is ready.
    assert.equal(next.enginesReady, false);
  });

  it("prefers the remembered address when pairing is restored", () => {
    const next = reduce(unpaired, {
      type: "paired",
      connection: { ...connection, lastGoodBaseUrl: "http://192.168.1.77:3000" },
    });
    assert.ok(next.status === "connected");
    assert.equal(next.baseUrl, "http://192.168.1.77:3000");
  });

  it("ignores a connect request when nothing is paired", () => {
    assert.deepEqual(reduce(unpaired, { type: "connect_requested" }), unpaired);
  });

  it("retries quietly a few times before telling the person", () => {
    let state: ConnectionState = { status: "connecting", attempt: 0, candidate: null };

    for (let attempt = 1; attempt < MAX_SILENT_ATTEMPTS; attempt += 1) {
      state = reduce(state, { type: "probe_failed", failure: "server_unreachable" });
      assert.equal(state.status, "connecting", `gave up after ${attempt} attempt(s)`);
    }

    state = reduce(state, { type: "probe_failed", failure: "server_unreachable" });
    assert.equal(state.status, "offline");
    assert.ok(state.status === "offline");
    assert.equal(state.failure, "server_unreachable");
    assert.ok(state.retryInMs !== null, "an unreachable computer is worth retrying");
  });

  it("gives up at once when retrying cannot possibly help", () => {
    const start: ConnectionState = { status: "connecting", attempt: 0, candidate: null };

    for (const failure of ["device_revoked", "token_expired", "wrong_server", "server_too_new"] as const) {
      const next = reduce(start, { type: "probe_failed", failure });
      assert.equal(next.status, "offline", `${failure} should stop the sweep`);
      assert.ok(next.status === "offline");
      assert.equal(next.failure, failure);
      assert.equal(next.retryInMs, null, `${failure} must not schedule a pointless retry`);
    }
  });

  it("reports connected with whatever the server said about its engines", () => {
    const next = reduce(
      { status: "connecting", attempt: 1, candidate: "http://x:3000" },
      { type: "probe_succeeded", baseUrl: "http://x:3000", info: { ...info, enginesReady: false } },
    );
    assert.ok(next.status === "connected");
    assert.equal(next.enginesReady, false);
    assert.equal(next.baseUrl, "http://x:3000");
  });

  it("says the phone is off Wi-Fi rather than timing out", () => {
    const connected: ConnectionState = {
      status: "connected",
      baseUrl: "http://192.168.1.42:3000",
      serverName: "Mac",
      enginesReady: true,
    };

    const offline = reduce(connected, {
      type: "network_changed",
      network: { hasNetwork: false, isWifi: false },
    });
    assert.ok(offline.status === "offline");
    assert.equal(offline.failure, "offline");

    const cellular = reduce(connected, {
      type: "network_changed",
      network: { hasNetwork: true, isWifi: false },
    });
    assert.ok(cellular.status === "offline");
    assert.equal(cellular.failure, "cellular_only");
  });

  it("starts a fresh sweep when Wi-Fi comes back, not the old address", () => {
    const stale: ConnectionState = { status: "offline", failure: "offline", retryInMs: null };
    const next = reduce(stale, {
      type: "network_changed",
      network: { hasNetwork: true, isWifi: true },
    });
    assert.ok(next.status === "connecting");
    assert.equal(next.attempt, 0, "a new network deserves a clean sweep");
    assert.equal(next.candidate, null);
  });

  it("leaves an unpaired phone alone on a network change", () => {
    assert.deepEqual(
      reduce(unpaired, { type: "network_changed", network: { hasNetwork: true, isWifi: true } }),
      unpaired,
    );
  });

  it("goes back to unpaired when the person disconnects", () => {
    const connected: ConnectionState = {
      status: "connected",
      baseUrl: "http://x:3000",
      serverName: "Mac",
      enginesReady: true,
    };
    assert.deepEqual(reduce(connected, { type: "unpaired" }), { status: "unpaired" });
  });

  it("keeps the attempt count across a probing event", () => {
    const state: ConnectionState = { status: "connecting", attempt: 2, candidate: null };
    const next = reduce(state, { type: "probing", candidate: "http://y:3000" });
    assert.ok(next.status === "connecting");
    assert.equal(next.attempt, 2);
    assert.equal(next.candidate, "http://y:3000");
  });
});

describe("remembering a good address", () => {
  it("records a new one", () => {
    const next = rememberGoodAddress(connection, "http://192.168.1.99:3000");
    assert.equal(next.lastGoodBaseUrl, "http://192.168.1.99:3000");
    assert.equal(next.serverId, connection.serverId);
  });

  it("returns the same object when nothing changed, so no write happens", () => {
    const stored = { ...connection, lastGoodBaseUrl: "http://192.168.1.42:3000" };
    assert.equal(rememberGoodAddress(stored, "http://192.168.1.42:3000"), stored);
  });
});
