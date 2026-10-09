#!/usr/bin/env node
// Imagoro Web Term smoke test.
//
//   node scripts/smoke.mjs            # file + build checks; then agent probe if deps present
//   AGENT_SMOKE=0 node scripts/smoke.mjs   # file checks only
//
// Exits non-zero on failure. Prints a one-line summary.
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const fail = (msg) => checks.push(["FAIL", msg]);
const ok = (msg) => checks.push(["ok", msg]);

// 1. required files
const required = [
  "package.json",
  "pnpm-workspace.yaml",
  "LICENSE",
  "README.md",
  "design/tokens.json",
  "apps/web/package.json",
  "apps/web/src/main.tsx",
  "apps/agent/package.json",
  "apps/agent/src/server.mjs",
  "apps/agent/src/shells.mjs",
  "worker/package.json",
  "worker/wrangler.toml",
  "worker/src/index.ts",
  "Dockerfile"
];
for (const f of required) {
  if (existsSync(join(root, f))) ok(`file ${f}`);
  else fail(`missing file ${f}`);
}

// 2. web build output (only if built)
const dist = join(root, "apps/web/dist/index.html");
if (existsSync(dist)) {
  const html = readFileSync(dist, "utf8");
  if (html.includes("Imagoro Web Term")) ok("web dist/index.html present");
  else fail("web dist/index.html missing title");
} else {
  ok("web dist not built yet (run `pnpm build`) - skipped");
}

// 3. live agent probe (verifies node-pty + ws actually work on this host)
const wantProbe = process.env.AGENT_SMOKE !== "0";
const agentDir = join(root, "apps/agent");
const depsPresent =
  existsSync(join(agentDir, "node_modules")) &&
  existsSync(join(root, "node_modules", ".pnpm"));

if (wantProbe && depsPresent) {
  const port = 8799;
  const proc = spawn(process.execPath, [join(agentDir, "src/server.mjs")], {
    cwd: agentDir,
    env: { ...process.env, AGENT_PORT: String(port), AGENT_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let out = "";
  proc.stdout.on("data", (d) => (out += d.toString()));
  proc.stderr.on("data", (d) => (out += d.toString()));

  try {
    const info = await retry(async () => {
      const res = await fetch(`http://127.0.0.1:${port}/shells`, {
        signal: AbortSignal.timeout(800)
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    }, 40, 250);
    if (Array.isArray(info.shells) && info.shells.length > 0)
      ok(`agent /shells -> [${info.shells.join(", ")}] on ${info.platform}`);
    else fail("agent returned no shells");
  } catch (err) {
    fail(`agent probe failed: ${err.message}\n--- agent output ---\n${out}`);
  } finally {
    proc.kill();
  }
} else if (wantProbe) {
  ok("agent deps not installed - skipped live probe");
}

async function retry(fn, attempts, delayMs) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

let failed = 0;
for (const [state, msg] of checks) {
  const icon = state === "ok" ? "  ok " : " FAIL";
  console.log(`${icon}  ${msg}`);
  if (state === "FAIL") failed++;
}
console.log(
  failed ? `\nSMOKE FAILED (${failed})` : `\nSMOKE OK (${checks.length} checks)`
);
process.exit(failed ? 1 : 0);
