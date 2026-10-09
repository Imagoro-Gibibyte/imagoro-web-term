# Deploy

Two independent halves: the **UI** (static, Cloudflare Pages) and the **shell**
(compute, Cloudflare Containers or a local agent).

## 0. Local

```bash
pnpm install
pnpm dev            # UI on http://localhost:8793 (demo tab, no backend)
pnpm agent          # real shell agent on ws://127.0.0.1:8787/ws
```

Set `VITE_AGENT_URL` (and `VITE_AGENT_TOKEN`) in `apps/web/.env.local` to point
the UI at an agent that is not on the default local URL.

## 1. UI -> Cloudflare Pages

```bash
pnpm build
pnpm --filter @imagoro/web-term-web exec wrangler pages deploy dist \
  --project-name imagoro-web-term
```

- To reach a remote agent, build with `VITE_AGENT_URL=wss://<host>/ws`.
- Add `apps/web/public/_redirects` containing `/* /index.html 200` (SPA).
- `.github/workflows/pages.yml` does this on push to `main` given
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## 2. Shell -> Cloudflare Containers

Prereqs: a Workers Paid plan (Containers), Docker installed locally (Wrangler
builds the image), and `wrangler login`.

```bash
pnpm --filter @imagoro/web-term-web build      # assets for the Worker
pnpm --filter @imagoro/web-term-worker deploy  # builds ../Dockerfile, deploys
```

Then point the UI at the Worker: build with `VITE_AGENT_URL=wss://<worker>/ws`.

Notes:

- The container listens on `8080` (see `Dockerfile`); `worker/src/session.ts`
  sets `defaultPort = 8080`.
- `instance_type = "dev"` is cheap for testing; move to a larger instance type
  for real use. `max_instances` caps concurrent shells.
- Containers sleep after `sleepAfter` (`15m`); the next request restarts one.

## 3. Auth (do this before exposing anything)

- **Cloudflare Access** in front of the Worker route is the simplest gate
  (email/SSO in front of `/ws`).
- Or set `AGENT_TOKEN` as a Worker secret and build the UI with a matching
  `VITE_AGENT_TOKEN`. Note the token then lives in the client bundle - prefer
  Access for anything public.
- Never run a public agent without TLS and a token.

## Verify

```bash
pnpm smoke                  # files + build + live agent probe on this host
curl -s https://<worker>/health   # {"ok":true,...}
```
