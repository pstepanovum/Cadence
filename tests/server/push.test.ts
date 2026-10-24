// FILE: tests/server/push.test.ts
//
// Remote push, the pure part: device registrations and campaign batches.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildExpoMessages, EXPO_BATCH, isExpoPushToken, parseCampaign, parsePushDevice } from "../../src/lib/server/push-messages.ts";

const token = (n: number) => `ExponentPushToken[abcdefghij${String(n).padStart(4, "0")}]`;

describe("push devices", () => {
  it("accepts a well-formed registration", () => {
    const parsed = parsePushDevice({ installId: "3f2b1c4d-0000-4000-8000-1234567890ab", expoPushToken: token(1), platform: "ios", timeZone: "America/New_York" });
    assert.equal(parsed.ok, true);
  });

  it("refuses anything that is not an Expo token", () => {
    for (const bad of ["", "abc", "ExponentPushToken[]", "https://evil.example/x", 5]) assert.equal(isExpoPushToken(bad), false, String(bad));
    const parsed = parsePushDevice({ installId: "3f2b1c4d-0000", expoPushToken: "nope", platform: "ios" });
    assert.equal(parsed.ok, false);
  });

  it("falls back to UTC for an odd time zone", () => {
    const parsed = parsePushDevice({ installId: "3f2b1c4d-0000", expoPushToken: token(1), platform: "android", timeZone: "<script>" });
    assert.ok(parsed.ok && parsed.device.timeZone === "UTC");
  });
});

describe("push campaigns", () => {
  it("batches unique tokens for Expo and keeps the link in-app", () => {
    const tokens = Array.from({ length: EXPO_BATCH + 5 }, (_, i) => token(i));
    const batches = buildExpoMessages([...tokens, tokens[0], "junk"], { title: "Hi", body: "New lessons", url: "https://elsewhere" });
    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, EXPO_BATCH);
    assert.equal(batches[1].length, 5);
    assert.equal(batches[0][0].data.url, "/");
  });

  it("validates a campaign request", () => {
    assert.equal(parseCampaign({ title: "Hi", body: "x", uids: [] }).ok, false);
    assert.equal(parseCampaign({ title: "Hi", body: "x", uids: ["abc123"], url: "/badges" }).ok, true);
  });
});
