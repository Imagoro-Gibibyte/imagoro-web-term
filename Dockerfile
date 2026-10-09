# Imagoro Web Term - Linux shell container.
# Runs apps/agent (node-pty + ws) as a non-root user, plus an sshd for the
# private, non-routable instance mesh. No general internet: the Worker sets
# `enableInternet = false` and allows only the mirror host (see worker/).
FROM node:20-bookworm-slim

# build-essential + python3 compile node-pty's native addon.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       bash zsh fish git openssh-server curl ca-certificates procps util-linux \
       build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

# Bake SSH host keys (regenerate per deployment if you prefer) and lock sshd
# down to key-only auth on the mesh.
RUN ssh-keygen -A \
  && sed -i \
       -e 's/^#\?PermitRootLogin.*/PermitRootLogin no/' \
       -e 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' \
       -e 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' \
       -e 's/^#\?AllowAgentForwarding.*/AllowAgentForwarding no/' \
       /etc/ssh/sshd_config

RUN useradd -m -s /bin/bash imagoro \
  && install -d -o imagoro -g imagoro /var/lib/imagoro/sandbox

WORKDIR /app
COPY apps/agent/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY apps/agent/src ./src
COPY apps/agent/start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV AGENT_HOST=0.0.0.0 \
    AGENT_PORT=8080 \
    AGENT_SHELL=bash \
    AGENT_CWD=/home/imagoro \
    AGENT_MAX_SESSIONS=8 \
    AGENT_SANDBOX_ONLY=1 \
    AGENT_SANDBOX_DIR=/var/lib/imagoro/sandbox \
    AGENT_SSH=1 \
    TERM=xterm-256color

EXPOSE 8080 22

CMD ["/app/start.sh"]
