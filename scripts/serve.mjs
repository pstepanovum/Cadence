#!/usr/bin/env node
// FILE: scripts/serve.mjs
//
// `pnpm serve` — start Cadence for the household and print the QR a phone
// scans. Nothing else to configure: the script works out the computer's Wi-Fi
// address, brings the services up if they are not already running, mints a
// pairing code and draws it in the terminal.
//
// Flags:
//   --no-start     talk to a server that is already running, do not start one
//   --port <n>     the port the web service listens on (default 3000)
//   --build        rebuild the container images first
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir, networkInterfaces, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const shouldStart = !args.includes("--no-start");
const shouldBuild = args.includes("--build");
const port = readFlag("--port") ?? process.env.CADENCE_PUBLIC_PORT ?? "3000";

const dataDir = process.env.CADENCE_DATA_DIR
  ? resolve(process.env.CADENCE_DATA_DIR)
  : join(homedir(), ".cadence");

const colors = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
};

function say(message = "") {
  process.stdout.write(`${message}\n`);
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * The address a phone would dial. Same ranking the server uses: real network
 * adapters ahead of docker bridges and VPN tunnels, never loopback, never a
 * 169.254 link-local (which means DHCP failed).
 */
function findLanAddress() {
  const deprioritized = /^(docker|br-|veth|utun|awdl|llw|bridge|vboxnet|vmnet|tap|tun)/i;
  const prioritized = /^(en|eth|wl|wlan|wlp|enp)/i;
  const found = [];

  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const isIpv4 = entry.family === "IPv4" || entry.family === 4;
      if (!isIpv4 || entry.internal || entry.address.startsWith("169.254.")) continue;
      found.push({
        address: entry.address,
        rank: deprioritized.test(name) ? 2 : prioritized.test(name) ? 0 : 1,
      });
    }
  }

  found.sort((left, right) => left.rank - right.rank);
  return found[0]?.address ?? null;
}

async function probe(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/pair/info`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function waitForServer(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let dots = 0;

  while (Date.now() < deadline) {
    const info = await probe(baseUrl);
    if (info) {
      process.stdout.write("\r\u001b[K");
      return info;
    }
    dots = (dots + 1) % 4;
    process.stdout.write(`\r${colors.dim}Waiting for Cadence to start${".".repeat(dots)}   ${colors.reset}`);
    await new Promise((done) => setTimeout(done, 1_000));
  }

  process.stdout.write("\r\u001b[K");
  return null;
}

function run(command, commandArgs, env) {
  return new Promise((done, fail) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0 ? done() : fail(new Error(`${command} exited with code ${code}`)),
    );
  });
}

async function readAdminToken() {
  if (process.env.CADENCE_PAIRING_ADMIN_TOKEN) {
    return process.env.CADENCE_PAIRING_ADMIN_TOKEN;
  }

  try {
    const state = JSON.parse(await readFile(join(dataDir, "pairing.json"), "utf8"));
    return typeof state.adminToken === "string" ? state.adminToken : null;
  } catch {
    return null;
  }
}

async function requestCode(baseUrl, adminToken) {
  const response = await fetch(`${baseUrl}/api/pair/code`, {
    method: "POST",
    headers: { "x-cadence-admin-token": adminToken },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error ?? `Cadence refused to make a pairing code (${response.status}).`);
  }

  return body;
}

async function showCode(baseUrl, adminToken) {
  const issued = await requestCode(baseUrl, adminToken);
  const qr = await QRCode.toString(issued.uri, {
    type: "terminal",
    small: true,
    errorCorrectionLevel: "M",
  });

  say();
  say(qr);
  say(`  ${colors.bold}Scan this with Cadence on your phone.${colors.reset}`);
  say();
  say(`  Or type this code:   ${colors.bold}${colors.green}${issued.displayCode}${colors.reset}`);
  say(`  Computer address:    ${issued.server.host}:${issued.server.port}`);
  if (issued.server.mdnsHost) {
    say(`  Also known as:       ${issued.server.mdnsHost}`);
  }
  say(
    `  ${colors.dim}This code works for two minutes and once only.${colors.reset}`,
  );
  say();
  say(`  ${colors.dim}Pairing screen in a browser:${colors.reset}`);
  say(`  ${colors.dim}http://localhost:${port}/pair?k=${adminToken}${colors.reset}`);
  say();
  say(`  ${colors.dim}Press Enter for a new code, Ctrl-C to stop.${colors.reset}`);
}

async function main() {
  const lanAddress = findLanAddress();
  const baseUrl = `http://127.0.0.1:${port}`;

  say();
  say(`${colors.bold}Cadence${colors.reset} ${colors.dim}— serving on your network${colors.reset}`);
  say();

  if (!lanAddress) {
    say(
      `  ${colors.yellow}This computer is not on a Wi-Fi or Ethernet network right now,${colors.reset}`,
    );
    say(`  ${colors.yellow}so a phone has no way to reach it. Connect and try again.${colors.reset}`);
    say();
    process.exitCode = 1;
    return;
  }

  say(`  Wi-Fi address:  ${colors.bold}${lanAddress}${colors.reset}`);
  say(`  Data folder:    ${colors.dim}${dataDir}${colors.reset}`);
  say();

  await mkdir(dataDir, { recursive: true });

  let info = await probe(baseUrl);

  if (!info && shouldStart) {
    if (!existsSync(join(repoRoot, "docker-compose.yml"))) {
      say(`  ${colors.red}No docker-compose.yml here, and nothing is listening on port ${port}.${colors.reset}`);
      process.exitCode = 1;
      return;
    }

    // A token the container keeps for this run. The server also writes one into
    // the data folder on first start; either satisfies the pairing screen.
    const adminToken = (await readAdminToken()) ?? randomBytes(24).toString("base64url");

    const env = {
      CADENCE_DATA_DIR: dataDir,
      // Run the container as this user so it can write into the bind-mounted
      // data folder. Without it, Linux hosts fail with a permission error the
      // first time the server tries to save pairing state.
      CADENCE_RUN_AS: `${process.getuid?.() ?? 1001}:${process.getgid?.() ?? 1001}`,
      CADENCE_LAN_HOST: lanAddress,
      CADENCE_SERVER_NAME: hostname().replace(/\.local$/i, "").replace(/-/g, " "),
      CADENCE_PUBLIC_PORT: String(port),
      CADENCE_PAIRING_ADMIN_TOKEN: adminToken,
    };

    say(`  ${colors.dim}Starting Cadence with Docker…${colors.reset}`);
    say();

    try {
      await run("docker", ["compose", "up", "-d", ...(shouldBuild ? ["--build"] : [])], env);
    } catch (error) {
      say();
      say(`  ${colors.red}Docker could not start Cadence.${colors.reset}`);
      say(`  ${colors.dim}${error.message}${colors.reset}`);
      say(`  ${colors.dim}Is Docker Desktop running?${colors.reset}`);
      process.exitCode = 1;
      return;
    }

    process.env.CADENCE_PAIRING_ADMIN_TOKEN = adminToken;

    // The engines download models on a cold start, which is slow but only once.
    info = await waitForServer(baseUrl, 10 * 60_000);

    if (!info) {
      say(`  ${colors.red}Cadence did not come up in time.${colors.reset}`);
      say(`  ${colors.dim}Try: docker compose logs -f web${colors.reset}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!info) {
    say(`  ${colors.red}Nothing is answering on ${baseUrl}.${colors.reset}`);
    say(`  ${colors.dim}Start Cadence first, or drop --no-start to have this script start it.${colors.reset}`);
    process.exitCode = 1;
    return;
  }

  const adminToken = await readAdminToken();

  if (!adminToken) {
    say(`  ${colors.red}Cadence is running, but this script cannot find its pairing key.${colors.reset}`);
    say(`  ${colors.dim}Expected it in ${join(dataDir, "pairing.json")}.${colors.reset}`);
    say(
      `  ${colors.dim}If the server uses a different data folder, set CADENCE_DATA_DIR to match.${colors.reset}`,
    );
    process.exitCode = 1;
    return;
  }

  say(`  ${colors.green}Cadence is running.${colors.reset} ${colors.dim}${info.serverName}${colors.reset}`);
  if (!info.enginesReady) {
    say(
      `  ${colors.yellow}The pronunciation engines are still warming up — pairing works now,${colors.reset}`,
    );
    say(`  ${colors.yellow}scoring will start working in a few minutes.${colors.reset}`);
  }

  await showCode(baseUrl, adminToken);

  const reader = createInterface({ input: process.stdin, output: process.stdout });
  reader.on("line", () => {
    showCode(baseUrl, adminToken).catch((error) => {
      say(`  ${colors.red}${error.message}${colors.reset}`);
    });
  });
  reader.on("SIGINT", () => {
    reader.close();
    say();
    say(`  ${colors.dim}Cadence keeps running in the background.${colors.reset}`);
    say(`  ${colors.dim}Stop it with: docker compose down${colors.reset}`);
    say();
    process.exit(0);
  });
}

main().catch((error) => {
  say(`${colors.red}${error.message}${colors.reset}`);
  process.exitCode = 1;
});
