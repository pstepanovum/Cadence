// FILE: tests/platform/drift.test.ts
//
// The shared platform modules (content model, engine routing, progress
// summary, the vocal-tract model) exist twice: src/lib/platform/ for the web,
// desktop and server, mobile/src/platform/ for the Expo app. They must be
// byte-identical below their header comments, or a phone and the server can
// disagree about what an exercise, a route or a mouth shape is.
// `node scripts/platform/sync-mobile.mjs` rewrites the mobile copies.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const SERVER = new URL("../../src/lib/platform/", import.meta.url);
const MOBILE = new URL("../../mobile/src/platform/", import.meta.url);

function listTs(dir: URL): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".ts"))
    .sort();
}

function split(dir: URL, rel: string): { header: string; body: string } {
  const source = readFileSync(new URL(rel, dir), "utf8");
  const start = source.indexOf("/**");
  assert.notEqual(start, -1, `no /** body marker in ${rel}`);
  return { header: source.slice(0, start), body: source.slice(start) };
}

describe("shared platform modules", () => {
  const server = listTs(SERVER);
  const mobile = listTs(MOBILE);

  it("exist on both sides", () => {
    assert.ok(server.length >= 4, "expected the shared modules under src/lib/platform");
    assert.deepEqual(mobile, server, "src/lib/platform and mobile/src/platform hold different files");
  });

  for (const rel of server) {
    it(`${rel} has not drifted`, () => {
      const a = split(SERVER, rel);
      const b = split(MOBILE, rel);
      assert.equal(b.body, a.body, `${rel} differs below the header; run node scripts/platform/sync-mobile.mjs`);
      assert.ok(a.header.startsWith(`// FILE: src/lib/platform/${rel}`), `${rel}: server header must name its own path`);
      assert.ok(b.header.startsWith(`// FILE: mobile/src/platform/${rel}`), `${rel}: mobile header must name its own path`);
    });
  }

  it("import each other only relatively with a .ts extension", () => {
    // Node's test runner, Metro and Next all resolve "./x.ts"; "@/" means a
    // different root in each project.
    for (const rel of server) {
      const { body } = split(SERVER, rel);
      for (const match of body.matchAll(/from\s+"([^"]+)"/g)) {
        assert.match(match[1], /^\.\.?\/.*\.ts$/, `${rel} imports ${match[1]}`);
      }
    }
  });
});
