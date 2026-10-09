#!/usr/bin/env bash
# Imagoro Web Term container entrypoint.
# Starts the SSH daemon for the non-routable mesh, then runs the pty agent as
# the unprivileged `imagoro` user.
set -euo pipefail

if [ -n "${AGENT_SSH_AUTHORIZED_KEYS:-}" ]; then
  install -d -m 700 -o imagoro -g imagoro /home/imagoro/.ssh
  printf '%s\n' "$AGENT_SSH_AUTHORIZED_KEYS" > /home/imagoro/.ssh/authorized_keys
  chown imagoro:imagoro /home/imagoro/.ssh/authorized_keys
  chmod 600 /home/imagoro/.ssh/authorized_keys
fi

if [ "${AGENT_SSH:-1}" = "1" ] && command -v sshd >/dev/null 2>&1; then
  mkdir -p /run/sshd
  /usr/sbin/sshd
  echo "[start] sshd up on :22 (private mesh only)"
fi

# Sandbox dir the mirror pull writes into; never a host path.
install -d -o imagoro -g imagoro "${AGENT_SANDBOX_DIR:-/var/lib/imagoro/sandbox}"

exec runuser -u imagoro -- node /app/src/server.mjs
