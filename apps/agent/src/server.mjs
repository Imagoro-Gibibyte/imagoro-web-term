#!/usr/bin/env node
// Imagoro Web Term pty agent.
//
// A single-file Node server that wraps node-pty in a JSON-framed WebSocket.
// It runs on Linux, Windows (ConPTY) and macOS; the shell it spawns is whatever
// that host offers (bash/zsh vs powershell.exe/cmd.exe). Run one agent per OS
// you want to reach - they are not meant to be combined on one host.
import http from "node:http";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
import { defaultShellId, listShells, platformLabel } from "./shells.mjs";

const require = createRequire(import.meta.url);
const pty = require("node-pty");

const VERSION = "0.1.0";
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

const shells = listShells();
const defaultShell = defaultShellId(shells);
console.log(`[agent] imagoro web term agent v${VERSION} on ${platformLabel()}`);
console.log(
  `[agent] shells: ${shells.map((s) => s.id).join(", ") || "(none detected)"}` +
    `  default: ${defaultShell ?? "(none)"}`
);

/** @type {Set<import('node-pty').IPty>} */
const live = new Set();

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? HOST}`);
  if (url.pathname === "/healthz") {
    return json(res, 200, { ok: true, platform: platformLabel(), version: VERSION });
  }
  if (url.pathname === "/shells") {
    return json(res, 200, {
      ok: true,
      platform: platformLabel(),
      shell: defaultShell,
      shells: shells.map((s) => s.id),
      version: VERSION
    });
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end(
      `Imagoro Web Term agent v${VERSION}\n` +
        `Connect with a WebSocket to /ws?shell=<id>&cols=<n>&rows=<n>.\n` +
        `Endpoints: /healthz, /shells\n`
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
    term = pty.spawn(shell.path, [], {
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
