// FILE: tests/server/ai-route-form.test.ts
//
// readFormCapped (behind every AI upload) refuses an oversized upload by the bytes it reads, not only
// by the declared Content-Length, which a chunked upload leaves out.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFormCapped } from "../../src/lib/server/http.ts";
import { AUDIO_MAX_BYTES } from "../../src/lib/platform/engine-routing.ts";

function chunked(form: FormData): Promise<Request> {
  const encoded = new Response(form);
  const contentType = encoded.headers.get("content-type") ?? "";
  return encoded.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 64 * 1024) controller.enqueue(bytes.slice(offset, offset + 64 * 1024));
        controller.close();
      },
    });
    return new Request("http://localhost/api/assess", { method: "POST", body: stream, headers: { "content-type": contentType }, duplex: "half" } as RequestInit);
  });
}

describe("readFormCapped", () => {
  it("reads a normal form", async () => {
    const form = new FormData();
    form.set("text", "thorough");
    form.set("audio", new Blob([new Uint8Array(1024)], { type: "audio/wav" }), "take.wav");
    const result = await readFormCapped(await chunked(form), AUDIO_MAX_BYTES + 64 * 1024);
    assert.ok(result instanceof FormData);
    assert.equal(result.get("text"), "thorough");
  });

  it("refuses an oversized chunked upload that declares no length", async () => {
    const form = new FormData();
    form.set("audio", new Blob([new Uint8Array(AUDIO_MAX_BYTES + 128 * 1024)], { type: "audio/wav" }), "take.wav");
    const request = await chunked(form);
    assert.equal(request.headers.get("content-length"), null);
    const result = await readFormCapped(request, AUDIO_MAX_BYTES + 64 * 1024);
    assert.equal(result, "too_large");
  });
});
