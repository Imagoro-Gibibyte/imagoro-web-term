# Architecture

## Pieces

```
apps/web      static xterm.js UI  ->  Cloudflare Pages
apps/agent    node-pty + ws       ->  Linux container (Cloudflare) | Windows | macOS
worker/       Worker + DO + Container binding  ->  terminates wss://
```

## Data flow (Cloudflare path)

```
browser tab ── wss://<worker>/ws?session=<id>&shell=&cols=&rows=
   └─ Worker: getContainer(env.SESSIONS, session).fetch(req)
        └─ Durable Object (SessionContainer) forwards to the container port
             └─ apps/agent: pty.spawn(shell)  <->  bash
```

Output travels back as `{type:"output",data}` frames. One Durable Object per
`session` id means each tab is isolated; a reconnecting tab reuses its warm
container until `sleepAfter` elapses.

## Why one agent per OS

`node-pty` spawns a PTY around whatever shell binary the **host** provides:

| Host | shells the agent offers |
| --- | --- |
| Linux | `bash`, `zsh`, `sh`, `fish` |
| macOS | `zsh`, `bash`, `sh`, `fish` |
| Windows (ConPTY) | `powershell.exe`, `pwsh.exe`, `cmd.exe`, `wsl.exe`, `bash.exe` |

A Linux container cannot spawn `powershell.exe`, and vice versa. So Windows and
macOS shells are served by **separate agent instances** (one on each machine),
each reachable directly over `wss://` or tunnelled. The browser holds tabs that
point at whichever agent/OS is relevant. Nothing runs "all OSes at once" on one
host - that is by design, and matches the goal.

## Protocol

JSON text frames, defined in `apps/web/src/terminal/agentClient.ts` and
implemented in `apps/agent/src/server.mjs`. JSON is chosen for debuggability;
switch to binary frames only if terminal throughput becomes a bottleneck.

## Security model

- The agent **execs a fixed, per-platform allowlisted shell**, never an
  arbitrary command; it does not use a shell to spawn a shell.
- It binds loopback by default and **refuses a public bind without a token**.
- The container is internal-only (`enableInternet = false`): reachable through
  the Worker, not the internet.
- For non-private use, gate the edge with **Cloudflare Access** and/or set
  `AGENT_TOKEN`. A reachable agent is a remote shell; always `wss://`.
