import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Network policy for the pty agent.
 *
 * The agent is expected to run with NO general internet:
 *  - in a Cloudflare Container, `enableInternet = false` + `allowedHosts`
 *    (see worker/src/session.ts)
 *  - on a local host, behind a firewall that blocks egress
 *
 * The only egress the agent itself performs is a *mirror pull* from
 * `AGENT_MIRROR_URL`, and `assertEgressAllowed` enforces that nothing else is
 * reachable. Nothing is written outside the sandbox.
 */

export function instanceIp() {
  return (process.env.AGENT_INSTANCE_IP ?? "").trim();
}

export function sshPeers() {
  return (process.env.AGENT_SSH_PEERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when we are inside a container / sandbox (so host writes are expected). */
export function sandboxOnly() {
  return (
    process.env.AGENT_SANDBOX_ONLY === "1" ||
    existsSync("/.dockerenv") ||
    process.env.container === "docker" ||
    process.env.container === "podman" ||
    process.env.KUBERNETES_SERVICE_HOST != null
  );
}

/** Hosts the agent may talk to. Empty means "no egress at all". */
export function allowedEgressHosts() {
  const explicit = (process.env.AGENT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hosts = new Set(explicit);
  if (process.env.AGENT_MIRROR_URL) {
    try {
      hosts.add(new URL(process.env.AGENT_MIRROR_URL).host);
    } catch {
      /* malformed mirror URL: ignored here, reported by mirror pull */
    }
  }
  return hosts;
}

/**
 * Throw unless `urlStr`'s host is on the egress allowlist. This is the single
 * gate for anything the agent fetches.
 */
export function assertEgressAllowed(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error(`not a URL: ${urlStr}`);
  }
  const allow = allowedEgressHosts();
  if (allow.size === 0) {
    throw new Error(
      "no egress allowlist configured (set AGENT_MIRROR_URL or AGENT_ALLOWED_HOSTS)"
    );
  }
  if (!allow.has(u.host)) {
    throw new Error(
      `egress blocked: ${u.host} is not reachable (allowed: ${[...allow].join(", ")})`
    );
  }
  return u;
}

/** The only place fetched/fetched-from data may be written. Never a host home. */
export function sandboxDir() {
  return process.env.AGENT_SANDBOX_DIR || join(tmpdir(), "imagoro-sandbox");
}

/**
 * Guard for anything that writes material fetched from the network. On a real
 * host (not a container) this refuses unless the operator explicitly opts in,
 * so nothing is downloaded to a host machine by default.
 */
export function assertSandboxWritable() {
  if (sandboxOnly()) return;
  if (process.env.AGENT_ALLOW_HOST_WRITES === "1") return;
  throw new Error(
    "refusing to write fetched data outside a sandbox: run in a container " +
      "(AGENT_SANDBOX_ONLY=1) or set AGENT_ALLOW_HOST_WRITES=1 to override"
  );
}
