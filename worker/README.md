# Imagoro Web Term - edge (Worker + Container)

Terminates `wss://` from the browser and proxies each session to a shell
container running `apps/agent`.

## Deploy

```bash
# build the web UI first (assets are read from ../apps/web/dist)
pnpm --dir .. --filter @imagoro/web-term-web build

pnpm --filter @imagoro/web-term-worker typecheck
pnpm --filter @imagoro/web-term-worker deploy   # runs `wrangler deploy`
```

Requires Docker locally for `wrangler deploy` to build the image, and a
cloudflare account with Containers enabled. See `../docs/DEPLOY.md`.

## Auth

The container is internal-only (`enableInternet = false`) and reachable only via
this Worker. For anything non-private, put **Cloudflare Access** in front of the
Worker route and/or set `AGENT_TOKEN` as a Worker secret. See `../docs/DEPLOY.md`.
