# Imagoro Web Term - pty agent

A single-file Node server that puts a real shell behind a WebSocket. It is the
only component that must run *on the machine you want a shell on*.

## Run

```bash
pnpm install
pnpm start          # or: node src/server.mjs
# ws://127.0.0.1:8787/ws
```

Then in the web UI click `+` and pick a shell (the UI reads `GET /shells`).

## Endpoints

| Method | Path       | Purpose                                              |
| ------ | ---------- | ---------------------------------------------------- |
| GET    | `/healthz` | liveness                                             |
| GET    | `/shells`  | `{ platform, shell, shells[], version }`             |
| WS     | `/ws`      | a shell session: `?shell=&cols=&rows=&token=`        |

## WebSocket protocol (JSON text frames)

Client -> agent:

```json
{ "type": "input",  "data": "ls\r" }
{ "type": "resize", "cols": 120, "rows": 30 }
{ "type": "ping" }
```

Agent -> client:

```json
{ "type": "output", "data": "..." }
{ "type": "ready",  "platform": "linux-x64", "shell": "bash" }
{ "type": "exit",   "code": 0 }
{ "type": "error",  "message": "..." }
```

## Configuration

| Env                    | Default     | Meaning                                                    |
| ---------------------- | ----------- | ---------------------------------------------------------- |
| `AGENT_PORT` / `PORT`  | `8787`      | listen port                                                |
| `AGENT_HOST`           | `127.0.0.1` | bind address                                               |
| `AGENT_TOKEN`          | _(unset)_   | required as `?token=` when set                             |
| `AGENT_SHELL`          | auto        | default shell id (e.g. `powershell.exe`, `zsh`)            |
| `AGENT_ALLOWED_SHELLS` | all         | comma list to expose, e.g. `bash,zsh`                      |
| `AGENT_CWD`            | `process.cwd()` | working directory for sessions                          |
| `AGENT_MAX_SESSIONS`   | `8`         | concurrent sessions                                        |
| `AGENT_INSECURE`       | `0`         | `1` allows a non-loopback bind with no token (unsafe)      |

## Safety

- Binds loopback by default.
- **Refuses to bind a public interface without `AGENT_TOKEN`** unless
  `AGENT_INSECURE=1`. A reachable agent is a remote shell - treat the token
  like a password and always put TLS (wss) in front of it.
- Shell selection is limited to a fixed per-platform allowlist, never an
  arbitrary command string, and the process is spawned with `shell: false`
  semantics (node-pty execs the resolved binary directly).
