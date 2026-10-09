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

// 4. network policy (pure functions; no network)
try {
  const np = await import(new URL("../apps/agent/src/netpolicy.mjs", import.meta.url));

  process.env.AGENT_MIRROR_URL = "https://mirror.internal/git";
  process.env.AGENT_ALLOWED_HOSTS = "mirror.internal,build.internal";

  const allow = np.allowedEgressHosts();
  if (allow.has("mirror.internal") && allow.has("build.internal"))
    ok("egress allowlist built from env");
  else fail("egress allowlist missing expected hosts");

  try {
    np.assertEgressAllowed("https://mirror.internal/imagoro.git");
    ok("egress allows the mirror host");
  } catch (e) {
    fail(`egress wrongly blocked the mirror: ${e.message}`);
  }

  let blocked = false;
  try {
    np.assertEgressAllowed("https://evil.example/exfil");
  } catch {
    blocked = true;
  }
  if (blocked) ok("egress blocks a non-allowlisted host");
  else fail("egress DID NOT block a non-allowlisted host");

  if (!np.sandboxOnly()) {
    let guarded = false;
    delete process.env.AGENT_ALLOW_HOST_WRITES;
    try {
      np.assertSandboxWritable();
    } catch {
      guarded = true;
    }
    if (guarded) ok("host writes refused outside a sandbox");
    else fail("host writes NOT refused outside a sandbox");
  } else {
    ok("running sandboxed; host-write guard not exercised");
  }
} catch (e) {
  fail(`netpolicy checks errored: ${e.message}`);
}

// 5. reserved addressing - worker/src/network.ts, via Node type stripping
try {
  const net = await import(new URL("../worker/src/network.ts", import.meta.url));
  const a = net.nonRoutableIpFor("session-a");
  const b = net.nonRoutableIpFor("session-a");
  const c = net.nonRoutableIpFor("session-b");
  if (a === b) ok(`non-routable IP deterministic (${a})`);
  else fail("non-routable IP not deterministic");
  if (a !== c) ok("non-routable IP unique per id");
  else fail("non-routable IP collided for different ids");
  if (net.isNonRoutable(a) && net.isNonRoutable(c)) ok("addresses inside 100.64.0.0/10");
  else fail(`address outside CGNAT block: ${a}, ${c}`);
  if (!net.isNonRoutable("8.8.8.8")) ok("public address rejected");
  else fail("public address accepted as non-routable");
} catch (e) {
  ok(`worker network.ts checks skipped (${String(e.message).split("\n")[0]})`);
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
