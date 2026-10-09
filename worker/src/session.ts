import { Container } from "@cloudflare/containers";

export interface Env {
  /** Durable Object namespace that owns shell session containers. */
  SESSIONS: DurableObjectNamespace<SessionContainer>;
  /** Optional token shared with the container's pty agent. */
  AGENT_TOKEN?: string;
  /** Static assets binding (the built web app), when served from the Worker. */
  ASSETS?: Fetcher;
}

/**
 * One Durable Object == one shell container. `getContainer(env.SESSIONS, id)`
 * wakes or starts the container for a session and forwards fetches to it.
 * Container requests are proxied by the Containers runtime to the pty agent
 * listening on `defaultPort`.
 */
export class SessionContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "15m";
  enableInternet = false;
  envVars = { AGENT_TOKEN: this.env.AGENT_TOKEN ?? "" };
}
