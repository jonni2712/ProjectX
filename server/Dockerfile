# ProjectX server — multi-stage build.
#
# The server has native dependencies (better-sqlite3, node-pty, bcrypt) that
# must be compiled with node-gyp, so the builder stage installs a toolchain.
# The runtime stage ships only the compiled output + production node_modules,
# plus `git` (the server shells out to git for repo operations).

# ---- Builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Toolchain for node-gyp native module compilation.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching), then build.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Strip dev dependencies (tsx, typescript, @types) — native prod modules stay,
# already compiled against this exact Node version/ABI.
RUN npm prune --omit=dev

# ---- Runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WORKSPACE_ROOT=/workspace

# `git` for repo operations, `tini` as PID 1 to reap node-pty/cloudflared children.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/data /workspace

# data/ holds config.json (0600) and the SQLite DB; /workspace holds user repos.
VOLUME ["/app/data", "/workspace"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
