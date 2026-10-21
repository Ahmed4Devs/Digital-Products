# syntax=docker/dockerfile:1
#
# Production image (spec §13.2, Phase 10): multi-stage, runs as the unprivileged `node`
# user. See docs/DEPLOYMENT.md for the build secrets, the environment and the commands
# a deployment runs (migrations, seed, maintenance).
#
#   docker build --secret id=build_env,src=.env.production -t digital-products .
#
# The build needs the production environment (catalog pages are prerendered from the
# database). It is mounted as a BuildKit secret, so it never lands in an image layer.

ARG NODE_IMAGE=node:24-bookworm-slim

# ── base: Node, pnpm (from packageManager) and the system libraries the app needs ─────
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_HOME=/opt/corepack \
    PNPM_HOME=/opt/pnpm
COPY docker/app/with-extra-ca.sh /usr/local/bin/with-extra-ca
# OpenSSL for Prisma's migration engine; CA certificates for outbound TLS (gateways,
# storage, email). Skipped when the base image already has both (e.g. node:24-bookworm).
# An optional `extra_ca` secret lets apt verify a TLS-inspecting proxy.
RUN --mount=type=secret,id=extra_ca,required=false \
    set -eu; \
    if ldconfig -p | grep -q 'libssl.so.3' && [ -f /etc/ssl/certs/ca-certificates.crt ]; then exit 0; fi; \
    if [ -f /run/secrets/extra_ca ]; then \
      printf 'Acquire::https::CAInfo "/run/secrets/extra_ca";\n' > /etc/apt/apt.conf.d/99extra-ca; \
      sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends openssl ca-certificates; \
    rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99extra-ca
WORKDIR /app
COPY package.json ./
# Git hooks are for development only (there is no .git here).
RUN --mount=type=secret,id=extra_ca,required=false \
    npm pkg delete scripts.prepare \
    && corepack enable \
    && with-extra-ca corepack install \
    && chmod -R a+rX /opt/corepack

# ── deps: every dependency, plus the generated Prisma client ───────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=secret,id=extra_ca,required=false \
    --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    with-extra-ca pnpm install --frozen-lockfile

# ── builder: the production build, then production dependencies only ─────────────────
FROM deps AS builder
COPY . .
RUN --mount=type=secret,id=build_env,target=/app/.env.production.local,required=true \
    --mount=type=secret,id=extra_ca,required=false \
    with-extra-ca pnpm build
RUN --mount=type=secret,id=extra_ca,required=false \
    --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    set -eu; \
    npm pkg delete scripts.prepare; \
    with-extra-ca pnpm install --frozen-lockfile --prod --offline; \
    rm -rf .next/cache; \
    mv .next /tmp/next-build

# ── runner: the app (read-only for its user) and the build output (writable caches) ────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder /app /app
COPY --from=builder --chown=node:node /tmp/next-build /app/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node_modules/.bin/next", "start"]
