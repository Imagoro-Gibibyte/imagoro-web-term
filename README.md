# Imagoro Web Term

A browser-based, **tabbable** terminal emulator. The UI is a static app that runs
anywhere (Cloudflare Pages); the shell is a small **pty agent** that runs on the
machine you want to reach. One browser can hold many tabs, each connected to a
different agent — a Linux container, a Windows box, a Mac — without running them
concurrently on one host.

```
 Browser (xterm.js tabs)                Cloudflare                         Your machines
 ┌──────────────────────┐   wss://   ┌────────────────────────┐  http   ┌───────────────────┐
 │  Imagoro Web Term UI │ ─────────► │ Worker + Durable Object│ ──────► │ Container (Linux) │
 │  Cloudflare Pages    │            │  (@cloudflare/containers)         │ node-pty + bash   │
 └──────────────────────┘            └────────────────────────┘         └───────────────────┘
            │
            └──────────── wss:// ─────────────────────────────────────► ┌───────────────────┐
                         (direct, dev / LAN)                            │ Windows / macOS   │
                                                                        │ node-pty + shell  │
                                                                        └───────────────────┘
```

- **`apps/web`** — Vite + React + [`@xterm/xterm`](https://xtermjs.org/). Deploys to Cloudflare Pages as static files. Has a **demo mode** that runs with no backend at all.
- **`apps/agent`** — a zero-framework Node server: [`node-pty`](https://github.com/microsoft/node-pty) + `ws`. Runs on Linux, Windows (ConPTY), and macOS, spawning `bash` / `zsh` / `powershell.exe` / `cmd.exe`. This is what runs inside the Cloudflare Container.
- **`worker`** — a Cloudflare Worker + Durable Object (via [`@cloudflare/containers`](https://developers.cloudflare.com/containers/)) that terminates `wss://` and proxies a shell session to the container.

## Why node-pty

`node-pty` wraps a real pseudo-terminal around **any** shell executable, so one
code path serves all three platforms — it just needs to run *on* the platform
whose shell you want. A Linux container cannot spawn `powershell.exe`; that is
why each OS is a **separate agent instance**, and the browser merely points tabs
at them. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quickstart

Requirements: Node 20+ and pnpm 9.

```bash
pnpm install
```

### 1. Just the UI (demo, no backend)

```bash
pnpm dev          # http://localhost:8793
```

The first tab is a simulated shell, so the UI and Pages build can be exercised
with zero infrastructure.

### 2. A real shell on this machine

```bash
pnpm agent        # ws://127.0.0.1:8787  (spawns your default shell)
pnpm dev          # then click "+" -> Agent
```

On Windows the agent offers `powershell.exe`, `pwsh.exe`, `cmd.exe`; on
Linux/macOS it offers `bash`, `zsh`, `sh`. Set `AGENT_SHELL` / `AGENT_TOKEN`
to control it (see [`apps/agent/README.md`](apps/agent/README.md)).

### 3. Cloudflare

- Frontend → Pages: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Shell container → Cloudflare Containers: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Repository layout

```
apps/web        Vite + React + xterm.js  (Cloudflare Pages target)
apps/agent      node-pty + ws pty server (Linux / Windows / macOS)
worker/         Cloudflare Worker + Durable Object + Container
design/         tokens.json -> gen.css (dark theme + mono)
docs/           AUDIT.md, ARCHITECTURE.md, DEPLOY.md
scripts/        smoke.mjs
```

## Status

Early. **P0/P1**: the UI and the pty agent work end-to-end locally; the
Cloudflare Container path is scaffolded and documented but not yet deployed.
The audit that seeded this repo is in [`docs/AUDIT.md`](docs/AUDIT.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
