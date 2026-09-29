import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeError,
  NOT_CONNECTED_MESSAGE,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
} from "../src/copy/errors.ts";

describe("describeError", () => {
  it("falls back when there is nothing to describe", () => {
    assert.equal(describeError(null, "Could not load."), "Could not load.");
    assert.equal(describeError(undefined, "Could not load."), "Could not load.");
    assert.equal(describeError(new Error(""), "Could not load."), "Could not load.");
    assert.equal(describeError({}, "Could not load."), "Could not load.");
  });

  it("recognises every wording the platform uses for 'offline'", () => {
    const offline = [
      "Network request failed",
      "TypeError: Failed to fetch",
      "fetch failed",
      // The real one the iOS build produced with the API down.
      "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)",
      "The Internet connection appears to be offline.",
      "connect ECONNREFUSED 127.0.0.1:3000",
      "Software caused connection abort",
    ];
    for (const message of offline) {
      assert.equal(describeError(new Error(message)), OFFLINE_MESSAGE, message);
    }
  });

  it("separates a timeout from a hard failure", () => {
    assert.equal(describeError(new Error("Request timed out")), TIMEOUT_MESSAGE);
    assert.equal(describeError(new Error("The operation was aborted")), TIMEOUT_MESSAGE);
  });

  it("explains an unpaired phone rather than blaming the network", () => {
    assert.equal(
      describeError(new Error("Cadence is not connected to a server yet.")),
      NOT_CONNECTED_MESSAGE,
    );
  });

  it("passes a real server message through untouched", () => {
    assert.equal(
      describeError(new Error("Pronunciation scoring is offline. Start the ai-engine service.")),
      "Pronunciation scoring is offline. Start the ai-engine service.",
    );
    assert.equal(describeError(new Error("Unauthorized.")), "Unauthorized.");
  });

  it("never shows a native stack frame to a learner", () => {
    assert.equal(
      describeError(new Error("Something exploded (at RNSomething/Thing.swift:120)"), "Fallback."),
      "Fallback.",
    );
    assert.equal(
      describeError(new Error("Boom at module.js:12:5"), "Fallback."),
      "Fallback.",
    );
  });

  it("accepts strings and error-shaped objects, not just Errors", () => {
    assert.equal(describeError("Network request failed"), OFFLINE_MESSAGE);
    assert.equal(describeError({ message: "Unknown lesson." }), "Unknown lesson.");
  });
});
