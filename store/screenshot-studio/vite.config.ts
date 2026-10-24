// FILE: store/screenshot-studio/vite.config.ts
//
// The dashboard and the export render through this dev server. Its small API:
//
//   GET/POST /__config        config/slides.config.json (export.mjs reads it too)
//   GET /__raw/manifest       the captures in store/screenshots/raw/ and their sizes
//   GET /__raw/<slug>.png     one capture
//
// Captures stay outside public/, so they are never part of a build.
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { RAW_DIR, RAW_NAME, rawManifest } from "./scripts/raw-files.mjs";

const CONFIG_PATH = resolve(import.meta.dirname, "config/slides.config.json");

function studioApi(): Plugin {
  return {
    name: "cadence-studio-api",
    configureServer(server) {
      server.middlewares.use("/__raw", (req, res) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0].replace(/^\//, ""));
        if (path === "manifest") {
          void rawManifest(RAW_DIR).then((files) => {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({ files }));
          });
          return;
        }
        if (!RAW_NAME.test(path)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const stream = createReadStream(resolve(RAW_DIR, path));
        stream.on("open", () => {
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "no-store");
          stream.pipe(res);
        });
        stream.on("error", () => {
          res.statusCode = 404;
          res.end();
        });
      });

      server.middlewares.use("/__config", (req, res) => {
        if (req.method === "GET") {
          readFile(CONFIG_PATH, "utf8")
            .then((body) => {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(body);
            })
            .catch(() => {
              res.statusCode = 404;
              res.end("{}");
            });
          return;
        }
        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => {
            try {
              // Parsed first, so a file the export cannot read is never written.
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              void mkdir(dirname(CONFIG_PATH), { recursive: true })
                .then(() => writeFile(CONFIG_PATH, `${JSON.stringify(parsed, null, 2)}\n`))
                .then(() => res.end('{"ok":true}'));
            } catch (error) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), studioApi()],
  server: { port: 5182, strictPort: false },
});
