// FILE: tests/auth/safe-next.test.ts
//
// `?next=` redirects must stay on this site.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "../../src/lib/auth/safe-next.ts";

describe("safeNextPath", () => {
  it("keeps paths on this site, with their query and hash", () => {
    assert.equal(safeNextPath("/dashboard"), "/dashboard");
    assert.equal(safeNextPath("/learn/basic?tab=2#exam"), "/learn/basic?tab=2#exam");
  });

  it("refuses anything that would leave the site", () => {
    for (const next of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "/\t/evil.com",
      "https://evil.com",
      "evil.com",
      "javascript:alert(1)",
      "",
    ]) {
      assert.equal(safeNextPath(next), null, next);
    }
  });

  it("refuses values that are not strings", () => {
    assert.equal(safeNextPath(undefined), null);
    assert.equal(safeNextPath(null), null);
    assert.equal(safeNextPath(["/dashboard"]), null);
  });
});
