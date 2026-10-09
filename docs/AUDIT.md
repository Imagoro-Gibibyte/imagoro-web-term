# Worktree audit - reusable assets for a browser terminal emulator

Audit of the seven Kepler worktrees (`imagoro`, `imagoro-ui`, `scout_crew`,
`secure-mesh-navigation`, `voxel-fps-engine-0.0`, `routing-scouting-app-to-be-named`,
plus the `voxel_engine` folder) for anything useful toward a browser-based,
tabbable terminal emulator. Result: **there is no terminal emulator, PTY, or
WebSocket server to reuse** - the emulator core is greenfield - but there is a
proof the stack can be deployed and a set of patterns/tokens worth borrowing.

## What exists (and what it is)

| Asset | Where | Verdict |
| --- | --- | --- |
| `blocks/terminal/src/index.tsx` | imagoro | 41-line **placeholder** block, not an emulator. `manifest.ts` id `imagoro.terminal`, api `pipeline/stream`. Not reusable as an emulator. |
| `blocks/console/src/index.tsx` | imagoro | 29-line append-only **log** view. |
| xterm.js / node-pty / websockets | everywhere | **Not present.** Only negative assertions in `scripts/smoke-l1.mjs` / `smoke-l2.mjs`. |
| `client/apps/portfolio` | imagoro | Vite + React app already **deploying to Cloudflare Pages**; `public/_redirects` = `/* /index.html 200`; `vite.config.ts` reads `IMAGORO_BASE_PATH`. Reuse the shape. |
| `docs/PORTFOLIO-CLOUDFLARE.md` | imagoro | Pages runbook: `wrangler pages deploy dist --project-name <name>`, CI `pages.yml`, gate `scripts/smoke-p7-cloudflare.mjs` -> `output/P7_CLOUDFLARE_OK.txt`. |
| `client/server/serve.mjs` | imagoro | ~786-line **zero-dep** `node:http` server with an SSE `/api/pipeline/stream`. Useful transport/logging reference; **does not** run on Pages. |
| `client/packages/core/src/eventbus.ts` | imagoro | `connectSse` client transport pattern; a good template for a reconnecting client. |
| `harness/src/scout.mjs` | imagoro | allowlisted `argv` exec, `shell:false`, timeout-kill. The exec-safety model to imitate. |
| `client/apps/portfolio/src/effects/ASCIIText.jsx` | imagoro | animated ASCII effect - aesthetic reference only. |
| `src/scout_crew/blackboard/*` | scout_crew | zero-dep stdlib HTTP + SQLite session/history store with token auth. Good auth/state reference. |
| `design/tokens.json` (+ `gen.css`, `gen-css.mjs`) | imagoro-ui | dark palette `#0B1020`/`#4F8CFF` and mono `Cascadia Code/Consolas`. **Adopted** as `design/tokens.json` here. |
| `third_party/imgui/imstb_truetype.h`, `imstb_rectpack.h` | voxel | native glyph-atlas reference; **not** web-portable. No reuse. |

## Key conclusions

1. **Greenfield emulator core.** No existing terminal rendering, PTY handling,
   or shell-session code to extend.
2. **Cloudflare Pages is static only.** It can host the xterm.js UI but cannot
   run a shell or a WebSocket server. The shell needs a compute host ->
   **Cloudflare Containers** (Linux) or a local agent (Windows/macOS).
3. **The stack is proven.** `imagoro` already ships a Vite+React app to Pages,
   so the frontend half of this repo is a known-good shape.
4. **Reuse is patterns + tokens, not code.** With attribution via `NOTICE`.

## What this repo takes

- `design/tokens.json` / `gen-css.mjs` - the Imagoro dark theme + mono font.
- The Pages app shape (Vite + React, `_redirects`, base-path env).
- The allowlist/`shell:false` exec-safety model for the pty agent.
- Nothing from the standing repos was modified; all work is in this new repo.
