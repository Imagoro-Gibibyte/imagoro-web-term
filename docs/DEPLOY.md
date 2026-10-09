# Deploy

Two independent halves: the **UI** (static, Cloudflare Pages) and the **shell**
(compute, Cloudflare Containers or a local agent). You can run either alone.

- `apps/web` -> static files. Works on Pages, and also runs in **demo mode with
  no backend at all**.
- `worker` + `Dockerfile` -> the real shell. Needs a Workers **Paid** plan and
  **Docker installed locally** (Wrangler builds the image with it).

> Hard limits worth knowing up front:
> - Cloudflare **Containers require the Workers Paid plan.** There is no free
>   tier for the shell half.
> - `wrangler deploy` for the container **needs Docker running on this machine**
>   (and `wrangler dev` for the container does too). No Docker -> you can ship
>   the UI but not the container shell.
> - The Worker serves the UI through an `[assets]` binding *and* owns `/ws`.
>   Pick one host for the UI: either let the **Worker** serve it (keep
>   `[assets]`), or deploy it to **Pages** and **delete the `[assets]` block**.
>   Serving both from the same route is not possible.

## 0. Local

```bash
pnpm install
pnpm dev            # UI on http://localhost:8793 (demo tab, no backend)
pnpm agent          # real shell agent on ws://127.0.0.1:8787/ws
```

Point the UI at an agent that is not the default local one with
`apps/web/.env.local`:

```
VITE_AGENT_URL=wss://your-host/ws
VITE_AGENT_TOKEN=<token>
```

`VITE_*` values are **baked into the bundle at build time** - rebuild to change
them, and never treat `VITE_AGENT_TOKEN` as a secret (see Auth).

## 1. UI -> Cloudflare Pages

```bash
pnpm build
pnpm --filter @imagoro/web-term-web exec wrangler pages deploy dist \
  --project-name imagoro-web-term
```

- Build against the shell you will connect to:
  `VITE_AGENT_URL=wss://<worker-host>/ws pnpm build` (add
  `VITE_AGENT_TOKEN=...` only if you set one).
- `apps/web/public/_redirects` already carries `/* /index.html 200` (SPA).
- `.github/workflows/pages.yml` does this automatically on push to `main` once
  the repo has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, and
  the `imagoro-web-term` Pages project exists.

## 2. Shell -> Cloudflare Containers (Workers Paid + Docker)

```bash
wrangler login                                  # once
pnpm --filter @imagoro/web-term-web build       # assets for the Worker [assets] block
pnpm --filter @imagoro/web-term-worker deploy   # builds ../Dockerfile, deploys
```

If you deployed the UI to Pages instead, **delete the `[assets]` block** in
`worker/wrangler.toml` first.

Then rebuild the UI pointed at the Worker:
`VITE_AGENT_URL=wss://imagoro-web-term.<subdomain>.workers.dev/ws pnpm build`.

Notes:

- **Isolation:** the container has no general internet
  (`enableInternet = false`). Set `MIRROR_HOST` / `MIRROR_URL` in
  `worker/wrangler.toml` to allow exactly one egress host (the mirror), and
  `SSH_PEERS` to expose `ssh:<peer>` tabs over the non-routable mesh. See
  [`NETWORK-POLICY.md`](NETWORK-POLICY.md).
- The container listens on `8080` (see `Dockerfile`); `worker/src/session.ts`
  sets `defaultPort = 8080`.
- `instance_type = "dev"` is cheap for testing; move to a larger instance type
  for real use. `max_instances` caps concurrent shells.
- Containers sleep after `sleepAfter` (`15m`); the next request restarts one.
- Each browser tab uses `?session=<id>`, so tabs get isolated containers and a
  reconnecting tab reuses its own.

## 3. Run the shell WITHOUT Cloudflare (no Docker, no Paid plan)

The agent is a plain Node process, so the fastest real-shell path is to run it
on a machine you control and point the Pages build at it:

```bash
AGENT_HOST=0.0.0.0 AGENT_PORT=8787 AGENT_TOKEN=<secret> pnpm agent
```

Build the UI with `VITE_AGENT_URL=ws://<host>:8787/ws` and
`VITE_AGENT_TOKEN=<secret>`. This is fine for a private/LAN box; for anything
public put TLS (wss) and a gate in front, and never leave `AGENT_TOKEN` unset
while bound to a public interface (the agent refuses to, unless
`AGENT_INSECURE=1`).

## 4. Auth (do this before exposing anything)

- **Cloudflare Access** in front of the Worker route is the simplest gate
  (email/SSO in front of `/ws`). Recommended.
- Or set `AGENT_TOKEN` as a Worker secret (`wrangler secret put AGENT_TOKEN`
  from `worker/`) and build the UI with a matching `VITE_AGENT_TOKEN`. The
  token then lives in the client bundle - prefer Access for anything public.
- Never run a public agent without TLS and a token.

## Verify

```bash
pnpm smoke                              # files + build + live agent probe on this host
curl -s https://<worker>/health         # {"ok":true,...}
curl -s "https://<worker>/instance?session=abc"   # {"session":"abc","ip":"100.64.x.y"}
```

`/instance` proves the non-routable address assignment without starting a
container; the shell itself only comes up on the first `/ws` connection.
