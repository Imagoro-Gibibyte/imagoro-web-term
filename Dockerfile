# Imagoro Web Term - Linux shell container.
# This image runs apps/agent (node-pty + ws) as a non-root user. Cloudflare
# Containers builds it from the repo root; see worker/wrangler.toml.
FROM node:20-bookworm-slim

# build-essential + python3 are needed to compile node-pty's native addon
# unless a prebuilt binary matches the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       bash zsh fish git curl ca-certificates procps \
       build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash imagoro

WORKDIR /app
COPY apps/agent/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY apps/agent/src ./src

ENV AGENT_HOST=0.0.0.0 \
    AGENT_PORT=8080 \
    AGENT_SHELL=bash \
    AGENT_CWD=/home/imagoro \
    AGENT_MAX_SESSIONS=8 \
    TERM=xterm-256color

USER imagoro
WORKDIR /home/imagoro
EXPOSE 8080

CMD ["node", "/app/src/server.mjs"]
