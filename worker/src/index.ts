import { getContainer } from "@cloudflare/containers";
import { nonRoutableIpFor } from "./network";
import { SessionContainer, type Env } from "./session";

export { SessionContainer };

/**
 * Edge for Imagoro Web Term.
 *
 * - `GET /ws?session=<id>` upgrades to a WebSocket and proxies it to the shell
 *   container for that session id. Each browser tab uses its own id, so tabs
 *   are isolated (and a reconnecting tab reuses its container).
 * - `GET /health` liveness.
 * - everything else falls through to the static assets binding (the web UI),
 *   when configured.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const session = url.searchParams.get("session") ?? "default";
      const container = getContainer(env.SESSIONS, session);
      return container.fetch(request);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "imagoro-web-term" });
    }

    // The non-routable address this session will be given (no container start).
    if (url.pathname === "/instance") {
      const session = url.searchParams.get("session") ?? "default";
      return Response.json({ session, ip: nonRoutableIpFor(session) });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);

    return new Response("Imagoro Web Term edge. Open the web app or connect to /ws.\n", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
} satisfies ExportedHandler<Env>;
