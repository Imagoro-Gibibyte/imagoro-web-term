import { Container } from "@cloudflare/containers";
import { nonRoutableIpFor } from "./network";

export interface Env {
  /** Durable Object namespace that owns shell session containers. */
  SESSIONS: DurableObjectNamespace<SessionContainer>;
  /** Optional token shared with the container's pty agent. */
  AGENT_TOKEN?: string;
  /** Static assets binding (the built web app), when served from the Worker. */
  ASSETS?: Fetcher;
  /** Comma-separated hostnames the container may reach. Normally just the mirror. */
  MIRROR_HOST?: string;
  /** Internal git mirror URL. The only thing the instances fetch from. */
  MIRROR_URL?: string;
  /** Comma-separated peer addresses for the SSH mesh (e.g. "100.64.0.7,100.64.0.9"). */
  SSH_PEERS?: string;
}

/**
 * One Durable Object == one shell container.
 *
 * Network posture:
 * - `enableInternet = false` -> no general web access at all.
 * - `allowedHosts` -> the mirror host (and nothing else) is reachable even
 *   though the internet is off.
 * - `AGENT_INSTANCE_IP` -> a unique, non-routable 100.64.0.0/10 address that
 *   identifies this instance on the private SSH mesh.
 * - `AGENT_SANDBOX_ONLY=1` -> the agent refuses to write fetched data anywhere
 *   but its own sandbox, so nothing lands on a host machine.
 */
export class SessionContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "15m";
  enableInternet = false;
  allowedHosts = (this.env.MIRROR_HOST ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  envVars = {
    AGENT_TOKEN: this.env.AGENT_TOKEN ?? "",
    AGENT_INSTANCE_IP: nonRoutableIpFor(this.ctx.id.toString()),
    AGENT_MIRROR_URL: this.env.MIRROR_URL ?? "",
    AGENT_SSH_PEERS: this.env.SSH_PEERS ?? "",
    AGENT_SANDBOX_ONLY: "1"
  };
}
