# Isolation & network policy

The terminal is a **shell**, so the default assumption is hostile: an instance
must not be able to browse the web, and must not be able to deposit anything on
a real machine. This document is the contract; the code that enforces it is
`worker/src/session.ts` and `apps/agent/src/netpolicy.mjs`.

## Rules

1. **No general internet.** The Linux container runs with
   `enableInternet = false`. There is no default route to the web.
2. **One allowed egress: the mirror.** `allowedHosts` is set to `MIRROR_HOST`
   (normally a single internal host). The agent's own fetches pass through
   `assertEgressAllowed`, which rejects any host not on
   `AGENT_ALLOWED_HOSTS` / `AGENT_MIRROR_URL`. Leave both empty for no egress.
3. **Unique, non-operable address per instance.** Each instance is assigned an
   address in **100.64.0.0/10** (RFC 6598 CGNAT) - reserved space that is never
   routed on the public internet. It is derived deterministically from the
   session id, so it is stable across restarts, and it exists only as an
   identity for the private mesh. `worker/src/network.ts` owns this.
4. **Instances are SSH-capable.** The container runs `sshd` (key-only, no root,
   no passwords, no agent forwarding). Peers listed in `SSH_PEERS` are offered
   as `ssh:<peer>` tabs, so one instance can drive another (e.g. Linux -> a
   Windows/macOS agent) over the non-routable mesh - never over the internet.
5. **Mirror pull, nothing else.** `POST /mirror/pull` clones/fetches the internal
   mirror into the sandbox and resolves a ref. That is the only repository
   source an instance has.
6. **Nothing downloads to a host machine.** Any write of fetched material goes
   through `assertSandboxWritable`, which refuses outside a container unless
   `AGENT_ALLOW_HOST_WRITES=1` is explicitly set. The mirror and all pulls live
   under `AGENT_SANDBOX_DIR` (a container path), never a host home directory.

## Reserved addressing

| Range          | Use                                                        |
| -------------- | ---------------------------------------------------------- |
| `100.64.0.0/10`| per-instance identity (non-routable, non-operable on the web) |

`nonRoutableIpFor(id)` hashes the Durable Object id into the block;
`isNonRoutable(ip)` checks membership. `GET /instance` (Worker) reports the
address a session will get, and `GET /instance` (agent) reports its own.

## Environment

| Var                     | Where  | Meaning                                             |
| ----------------------- | ------ | --------------------------------------------------- |
| `enableInternet`        | Worker | must stay `false`                                   |
| `MIRROR_HOST`           | Worker | hostnames allowed through `allowedHosts`            |
| `MIRROR_URL`            | Worker | passed to the agent as `AGENT_MIRROR_URL`           |
| `SSH_PEERS`             | Worker | passed to the agent as `AGENT_SSH_PEERS`            |
| `AGENT_ALLOWED_HOSTS`   | Agent  | extra allowed egress hosts (comma list)             |
| `AGENT_MIRROR_URL`      | Agent  | the one repo source; also added to the allowlist    |
| `AGENT_SANDBOX_ONLY`    | Agent  | `1` in the container: permits sandboxed writes      |
| `AGENT_SANDBOX_DIR`     | Agent  | where mirror pulls are written                      |
| `AGENT_ALLOW_HOST_WRITES`| Agent | `1` to allow host writes (unsafe; off by default)   |
| `AGENT_SSH_PEERS`       | Agent  | peers exposed as `ssh:<peer>` tabs                  |
| `AGENT_SSH`             | Agent  | `1` (default in the image) to start `sshd`          |

## Honest limits

- "Non-operable IP" is an **identity**, not a firewall rule by itself. The
  actual egress block is `enableInternet=false` + `allowedHosts` in the Worker;
  the reserved address only names the instance and can never be a public route.
- The SSH mesh trusts peers by address; with `StrictHostKeyChecking=no` in the
  sandbox the mesh is intentionally low-ceremony. Keep it on the private range.
- The container path is scaffolded and reviewed but not yet deployed (no local
  Docker). See `DEPLOY.md`.
