#!/usr/bin/env node
// Imagoro Web Term pty agent.
//
// A single-file Node server that wraps node-pty in a JSON-framed WebSocket.
// It runs on Linux, Windows (ConPTY) and macOS; the shell it spawns is whatever
// that host offers (bash/zsh vs powershell.exe/cmd.exe). Run one agent per OS
// you want to reach - they are not meant to be combined on one host.
//
// Network posture: the agent assumes NO general internet. Its only egress is a
// mirror pull from AGENT_MIRROR_URL, gated by ./netpolicy.mjs. Each instance
// also carries a unique non-routable address and can open ssh:<peer> sessions
// across the private mesh.
import http from "node:http";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
import { defaultShellId, listShells, platformLabel, resolveOnPath } from "./shells.mjs";
import {
  allowedEgressHosts,
  instanceIp,
  sandboxOnly,
  sshPeers
} from "./netpolicy.mjs";
import { mirrorPull, mirrorUrl } from "./mirror.mjs";

const require = createRequire(import.meta.url);
const pty = require("node-pty");

const VERSION = "0.2.0";
const PORT = Number(process.env.AGENT_PORT ?? process.env.PORT ?? 8787);
const HOST = process.env.AGENT_HOST ?? "127.0.0.1";
const TOKEN = process.env.AGENT_TOKEN ?? "";
const MAX_SESSIONS = Number(process.env.AGENT_MAX_SESSIONS ?? 8);
const CWD = process.env.AGENT_CWD ?? process.cwd();

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
if (!LOOPBACK.has(HOST) && !TOKEN && process.env.AGENT_INSECURE !== "1") {
  console.error(
    `[agent] refusing to bind ${HOST} without AGENT_TOKEN. ` +
      `Set AGENT_TOKEN=<secret>, or AGENT_INSECURE=1 to override (unsafe).`
  );
  process.exit(1);
}

// Local shells first, then ssh:<peer> entries for the private mesh.
const localShells = listShells();
const sshPath = resolveOnPath("ssh");
const peers = sshPeers().filter((p) => /^[A-Za-z0-9._:-]+$/.test(p) && !p.startsWith("-"));
const peerShells = sshPath
  ? peers.map((peer) => ({
      id: `ssh:${peer}`,
      path: sshPath,
      args: [
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "LogLevel=ERROR",
        "-o",
        "ConnectTimeout=10",
        peer
      ]
    }))
  : [];
const shells = [...localShells, ...peerShells];
const defaultShell = defaultShellId(localShells) ?? shells[0]?.id ?? null;

console.log(`[agent] imagoro web term agent v${VERSION} on ${platformLabel()}`);
console.log(
  `[agent] shells: ${shells.map((s) => s.id).join(", ") || "(none detected)"}` +
    `  default: ${defaultShell ?? "(none)"}`
);
console.log(
  `[agent] instance ip: ${instanceIp() || "(unset)"}  sandbox-only: ${sandboxOnly()}`
);
console.log(
  `[agent] egress allowlist: ${[...allowedEgressHosts()].join(", ") || "(none - no egress)"}` +
    `  mirror: ${mirrorUrl() || "(unset)"}`
);

/** @type {Set<import('node-pty').IPty>} */
const live = new Set();

// The Pages UI is a different origin; let cross-origin reads through. The WS
// upgrade itself is not CORS-gated by browsers, but GET /shells etc. are.
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
}

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  applyCors(res);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
};

function httpAuthorized(req, url) {
  if (!TOKEN) return true;
  const header = req.headers["authorization"] ?? "";
  if (header === `Bearer ${TOKEN}`) return true;
  return url.searchParams.get("token") === TOKEN;
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? HOST}`);

  if (req.method === "OPTIONS") {
    applyCors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    return json(res, 200, { ok: true, platform: platformLabel(), version: VERSION });
  }

  if (req.method === "GET" && url.pathname === "/shells") {
    return json(res, 200, {
      ok: true,
      platform: platformLabel(),
      shell: defaultShell,
      shells: shells.map((s) => s.id),
      version: VERSION
    });
  }

  if (req.method === "GET" && url.pathname === "/instance") {
    return json(res, 200, {
      ok: true,
      version: VERSION,
      platform: platformLabel(),
      ip: instanceIp(),
      sandboxOnly: sandboxOnly(),
      mirror: mirrorUrl(),
      peers,
      egress: [...allowedEgressHosts()]
    });
  }

  if (req.method === "POST" && url.pathname === "/mirror/pull") {
    if (!httpAuthorized(req, url)) return json(res, 401, { ok: false, error: "unauthorized" });
    try {
      const body = await readJson(req);
      const result = await mirrorPull(typeof body.ref === "string" ? body.ref : "HEAD");
      return json(res, 200, { ok: true, ...result });
    } catch (err) {
      return json(res, 400, { ok: false, error: String(err.message ?? err) });
    }
  }

  if (req.method === "GET" && url.pathname === "/") {
    applyCors(res);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end(
      `Imagoro Web Term agent v${VERSION}\n` +
        `Connect with a WebSocket to /ws?shell=<id>&cols=<n>&rows=<n>.\n` +
        `Endpoints: /healthz, /shells, /instance, POST /mirror/pull\n`
    );
  }

  json(res, 404, { ok: false, error: "not found" });
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? HOST}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  if (TOKEN && url.searchParams.get("token") !== TOKEN) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  if (live.size >= MAX_SESSIONS) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req, url));
});

wss.on("connection", (ws, _req, url) => {
  const requested = url.searchParams.get("shell") ?? defaultShell;
  const shell = shells.find((s) => s.id === requested) ?? shells[0];
  const cols = clampInt(url.searchParams.get("cols"), 80, 2, 1000);
  const rows = clampInt(url.searchParams.get("rows"), 24, 2, 1000);

  if (!shell) {
    ws.send(JSON.stringify({ type: "error", message: "no shell available on this host" }));
    ws.close();
    return;
  }

  let term;
  try {
    term = pty.spawn(shell.path, shell.args ?? [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: CWD,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }
    });
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: `spawn failed: ${err.message}` }));
    ws.close();
    return;
  }

  live.add(term);
  console.log(`[agent] session ${term.pid} (${shell.id}) cols=${cols} rows=${rows}`);

  const send = (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  send({ type: "ready", platform: platformLabel(), shell: shell.id });

  term.onData((data) => send({ type: "output", data }));
  term.onExit(({ exitCode }) => {
    send({ type: "exit", code: exitCode });
    live.delete(term);
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "input":
        if (typeof msg.data === "string") term.write(msg.data);
        break;
      case "resize":
        if (msg.cols && msg.rows) {
          try {
            term.resize(clampInt(msg.cols, cols, 2, 1000), clampInt(msg.rows, rows, 2, 1000));
          } catch {
            /* ignore races during teardown */
          }
        }
        break;
      case "ping":
        send({ type: "pong" });
        break;
    }
  });

  ws.on("close", () => {
    live.delete(term);
    try {
      term.kill();
    } catch {
      /* already dead */
    }
    console.log(`[agent] closed session ${term.pid}`);
  });

  ws.on("error", () => ws.close());
});

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function shutdown() {
  console.log("\n[agent] shutting down");
  for (const term of live) {
    try {
      term.kill();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, HOST, () => {
  console.log(`[agent] listening on ws://${HOST}:${PORT}/ws`);
  if (!TOKEN && !LOOPBACK.has(HOST)) {
    console.warn("[agent] WARNING: no AGENT_TOKEN set - anyone who can reach this port gets a shell");
  }
});
