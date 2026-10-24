import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blockMessage, offerLabel } from "../src/copy/ai-offer.ts";
import { routeRequest, AI_CAPABILITIES } from "../src/platform/engine-routing.ts";

describe("AI offers", () => {
  it("own-server mode never offers Plus", () => {
    const decision = routeRequest({
      capability: "score",
      local: { paired: true, reachable: false, capabilities: AI_CAPABILITIES },
      signedIn: false,
      plus: false,
      cloud: { configured: false, paused: false, quotaLeft: null },
    });
    assert.equal(decision.route, "blocked");
    if (decision.route === "blocked") {
      assert.deepEqual(decision.offers, ["reconnect_own_server"]);
      assert.match(blockMessage(decision.reason, decision.note), /isn't reachable/);
    }
  });

  it("uses the agreed daily-limit copy", () => {
    assert.equal(blockMessage("daily_limit"), "Daily limit reached. Connect your own Cadence for unlimited practice.");
  });

  it("frames the own server as its own option", () => {
    assert.equal(offerLabel("connect_own_server"), "Connect your own Cadence server");
    assert.ok(!/free|avoid|instead of paying/i.test(blockMessage("needs_plus")));
  });
});
