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

| Method | Path            | Purpose                                                    |
| ------ | --------------- | ---------------------------------------------------------- |
| GET    | `/healthz`      | liveness                                                   |
| GET    | `/shells`       | `{ platform, shell, shells[], version }`                   |
| GET    | `/instance`     | `{ ip, sandboxOnly, mirror, peers, egress }`               |
| POST   | `/mirror/pull`  | pull the internal mirror into the sandbox; body `{ "ref" }`|
| WS     | `/ws`           | a shell session: `?shell=&cols=&rows=&token=`              |

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
| `AGENT_INSTANCE_IP`    | _(unset)_   | this instance's non-routable address (set by the Worker)    |
| `AGENT_MIRROR_URL`     | _(unset)_   | the internal mirror; the only repo source, added to egress  |
| `AGENT_ALLOWED_HOSTS`  | _(unset)_   | extra egress hosts (comma list); empty = no egress          |
| `AGENT_SANDBOX_ONLY`   | _(unset)_   | `1` in a container: permits sandboxed writes                |
| `AGENT_SANDBOX_DIR`    | temp dir    | where mirror pulls are written (never a host home)          |
| `AGENT_ALLOW_HOST_WRITES` | `0`      | `1` allows fetched writes on a real host (unsafe)           |
| `AGENT_SSH_PEERS`      | _(unset)_   | peers exposed as `ssh:<peer>` tabs on the mesh              |
| `AGENT_SSH`            | `0`         | `1` starts `sshd` (the container sets this)                 |

## Safety

- Binds loopback by default.
- **Refuses to bind a public interface without `AGENT_TOKEN`** unless
  `AGENT_INSECURE=1`. A reachable agent is a remote shell - treat the token
  like a password and always put TLS (wss) in front of it.
- Shell selection is limited to a fixed per-platform allowlist, never an
  arbitrary command string, and the process is spawned with `shell: false`
  semantics (node-pty execs the resolved binary directly) - including
  `ssh:<peer>`, whose peer must be on `AGENT_SSH_PEERS` and match a safe
  pattern.
- **Egress is allowlisted** (`assertEgressAllowed`): the only fetch is the
  mirror at `AGENT_MIRROR_URL`.
- **Nothing is written to a host machine** by default: fetched material goes to
  `AGENT_SANDBOX_DIR` and host writes are refused outside a container.
- Full contract: [`../../docs/NETWORK-POLICY.md`](../../docs/NETWORK-POLICY.md).
