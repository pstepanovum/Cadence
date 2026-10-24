#!/usr/bin/env node
// FILE: tests/e2e/support/brevo-stub.mjs
//
// A stand-in for Brevo's REST API in end-to-end runs (the server is pointed
// here with BREVO_API_URL). It answers like Brevo for the calls Cadence makes
// and records every request, which the tests read back:
//
//   GET    /__requests   every request so far, as JSON
//   DELETE /__requests   forget them
//
// Nothing leaves the machine.
import { createServer } from "node:http";

const PORT = Number(process.env.BREVO_STUB_PORT ?? 3399);
const requests = [];

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://stub");
    if (url.pathname === "/__requests") {
      if (req.method === "DELETE") requests.length = 0;
      return send(res, 200, requests);
    }
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    requests.push({ method: req.method, path: url.pathname, body, apiKeyPresent: Boolean(req.headers["api-key"]), at: Date.now() });

    if (url.pathname.endsWith("/smtp/email")) return send(res, 201, { messageId: `<stub-${requests.length}@brevo>` });
    if (url.pathname.endsWith("/contacts/doubleOptinConfirmation")) return send(res, 204);
    if (req.method === "GET" && url.pathname.includes("/contacts/")) return send(res, 404, { code: "document_not_found", message: "Contact does not exist" });
    if (url.pathname.endsWith("/contacts")) return send(res, 201, { id: requests.length });
    return send(res, 204);
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Brevo stub on http://127.0.0.1:${PORT}`));
