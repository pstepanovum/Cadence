// Run with: npm test  (node --test, native TypeScript type stripping)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { htmlToPlainText, narrationChunks } from "../src/practice/narration.ts";

describe("htmlToPlainText", () => {
  it("drops tags, decodes common entities and collapses whitespace", () => {
    assert.equal(
      htmlToPlainText("<h2>The&nbsp;TH sound</h2>\n<p>Tongue &amp; teeth.</p>"),
      "The TH sound Tongue & teeth.",
    );
  });

  it("returns an empty string for markup with no text", () => {
    assert.equal(htmlToPlainText("<p> </p><br/>"), "");
  });
});

describe("narrationChunks", () => {
  it("returns nothing for empty text", () => {
    assert.deepEqual(narrationChunks("   "), []);
  });

  it("keeps short text in one chunk", () => {
    assert.deepEqual(narrationChunks("One. Two? Three!"), ["One. Two? Three!"]);
  });

  it("splits on sentence boundaries and never exceeds the limit", () => {
    const text = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota. Kappa lambda mu.";
    const chunks = narrationChunks(text, 40);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 40, `"${chunk}" is ${chunk.length} long`);
      assert.match(chunk, /[.!?]$/);
    }
    assert.equal(chunks.join(" "), text);
  });

  it("breaks an over-long sentence at a space, not mid-word", () => {
    const sentence = `${"word ".repeat(30).trim()}.`;
    const chunks = narrationChunks(sentence, 50);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 50);
      assert.ok(!chunk.startsWith(" ") && !chunk.endsWith(" "));
      assert.match(chunk, /^(word ?)+\.?$/);
    }
    assert.equal(chunks.join(" "), sentence);
  });

  it("keeps the tail after the last full stop", () => {
    assert.deepEqual(narrationChunks("Done. And then", 600), ["Done. And then"]);
  });
});
