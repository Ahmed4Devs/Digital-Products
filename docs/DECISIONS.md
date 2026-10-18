# Decisions

Minor gaps in the specification are resolved with the most conservative option and recorded here. Decisions that need the owner's approval are marked **⚠ Owner approval**.

---

## 2026-10-17 — Toolchain versions

**Decision.** Next.js 16.4.2, React / React DOM 19.3.1, Tailwind CSS 4.3.3, Prisma ORM 7.10.1 (pinned `^7`), Zod 4.6.7, Vitest 5.0.5 (Vite 8), Playwright 1.64.1, pnpm 11.25.0, Node.js 24 LTS. **TypeScript 6.0.x** (pinned `~6.0`) and **ESLint 9.x**.

**Reason.** TypeScript 7.0 and ESLint 10 are the newest majors, but `typescript-eslint` only supports TypeScript `< 6.1`, and the plugins bundled in `eslint-config-next` 16.4.2 (`import`, `jsx-a11y`, `react`) declare ESLint `≤ 9` as their peer range. ESLint 9 is still published under the `maintenance` dist-tag.

**Alternatives.** TypeScript 7 / ESLint 10 now (breaks linting); TypeScript 5.9 (older than necessary). Revisit when `eslint-config-next` and `typescript-eslint` support the new majors.

## 2026-10-17 — pnpm 11 build-script allow-list

**Decision.** `pnpm-workspace.yaml` → `allowBuilds`: `@prisma/engines` and `prisma` allowed (schema-engine download; Node version check), `unrs-resolver` and `simple-git-hooks` denied (binding check only; hooks are installed by the root `prepare` script).

**Reason.** pnpm 11 denies dependency lifecycle scripts by default; every allowed script is a reviewed supply-chain exception.

## 2026-10-17 — Partial Prefetching enabled

**Decision.** Keep `partialPrefetching: true` (present in the scaffold).

**Reason.** Next.js 16.4 logs a warning when Cache Components is enabled without it, it reduces prefetch traffic to one static App Shell per route, and it is required for the `'shell'` / `'prefetch'` levels of `ensureStatic`. It becomes the default in the next major.

## 2026-10-17 — shadcn/ui output kept as generated

**Decision.** Accept the CLI v4 output (`style: base-nova`, `rtl: true`, Base UI primitives). `lib/utils.ts` re-exports `cn` from the **`cn`** package. `shadcn` and `tw-animate-css` are **devDependencies**.

**Reason.** `cn` is published by the shadcn maintainer (repository `shadcn-ui/cn`, no dependencies) as a compiled replacement for `clsx` + `tailwind-merge`, which the CLI now installs by default. `shadcn` (a CLI with heavy dependencies) and `tw-animate-css` are only imported by `globals.css` at build time, so they do not belong in production dependencies.

## 2026-10-17 — Font

**Decision.** IBM Plex Sans Arabic via `next/font/google` (self-hosted at build), weights 400/500/600/700, subsets `arabic` + `latin`, `display: swap`. It replaces the Geist font the shadcn CLI added.

**Reason.** Spec §7.3. The family is not variable, so explicit weights are required.

## 2026-10-17 — Local service ports

**Decision.** PostgreSQL `5462`, Mailpit SMTP `1032` / UI `8032`, MinIO `9010` / console `9011`, all bound to `127.0.0.1`; E2E server on `3100`.

**Reason.** The development machine runs many other Docker projects and a native PostgreSQL on `5432`; loopback binding keeps local services unreachable from the network.

## 2026-10-17 — MinIO image source

**Decision.** Build the local MinIO images on **Chainguard's free images** (`cgr.dev/chainguard/minio`, `minio-client`), with a small `wolfi-base` stage that creates a `/data` directory owned by the non-root user and a shell-capable init image for bucket bootstrapping.

**Reason.** MinIO stopped publishing community Docker images in late 2025; `minio/minio` no longer exists on Docker Hub, and the last quay.io image (September 2025) predates a security release. Chainguard builds from current MinIO source (RELEASE.2026-09-22 at the time of writing). Local development only; production uses Cloudflare R2.

**Alternatives.** Frozen quay.io image (known CVE), community mirrors (unaffiliated), Garage/SeaweedFS (not MinIO as the spec requires).

## 2026-10-17 — Local object storage layout

**Decision.** Two buckets: `S3_BUCKET_PRIVATE` (product files, anonymous access explicitly `none`) and `S3_BUCKET_PUBLIC` (product images, anonymous read). The app uses a dedicated MinIO user whose policy covers only those two buckets; MinIO CORS allows only `APP_URL`.

**Reason.** Spec §5.1 (private files, no public URLs) and §12 (public images from a CDN, separate from private files); least privilege.

## 2026-10-17 — Database least privilege and encoding

**Decision.** The PostgreSQL superuser is only used by the container entrypoint. An init script creates `APP_DB_USER` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`) that owns three databases (`<name>`, `<name>_shadow`, `<name>_test`); `PUBLIC` loses all privileges on them. Clusters use UTF-8 with the built-in `C.UTF-8` locale provider.

**Reason.** Spec §5.1 (least privilege, never a superuser in the connection string) and §7.6 (UTF-8). Owning the database makes the role the owner of its `public` schema (PostgreSQL 15+ `pg_database_owner`), so it can migrate without broader rights. A pre-created shadow database avoids granting `CREATEDB` for `prisma migrate dev`. The built-in provider is OS-independent and gives Unicode-aware case mapping.

## 2026-10-17 — Prisma configuration without dotenv

**Decision.** `prisma.config.ts` loads `.env.local` with Node's built-in `process.loadEnvFile()` (existing variables win) and passes `process.env.DATABASE_URL` rather than Prisma's `env()` helper.

**Reason.** Avoids a `dotenv` dependency (rule 4). `env()` throws when the variable is missing, which would break `prisma generate` in builds that have no database URL; migration commands still fail clearly without one.

## 2026-10-17 — Environment validation timing

**Decision.** `lib/env/schema.ts` (pure Zod schema) + `lib/env/server.ts` (`server-only`, lazy, cached). `instrumentation.ts` validates at server start and skips the build phase. Error messages list variable names only.

**Reason.** "Fail fast at startup" (spec §5.1) without requiring runtime secrets during `next build` (Docker images are built without secrets).

## 2026-10-17 — Production environment rules and the loopback exemption

**Decision.** With `NODE_ENV=production`, `APP_URL` must be `https` and `DATABASE_URL` must use `sslmode=require|verify-ca|verify-full`, **unless both `APP_URL` and the database host are loopback** (`localhost`, `127.0.0.1`, `[::1]`).

**Reason.** Spec §13.2 requires TLS to the independent production database. A production build running entirely on one machine (E2E, Lighthouse) gains nothing from TLS on loopback, and a deployed server never has a loopback `APP_URL`, so the exemption cannot weaken a real deployment. Covered by unit tests.

## 2026-10-17 — Health check

**Decision.** `GET /api/health` calls `connection()` so it is never prerendered, runs `SELECT 1` with a 2 s timeout, returns `200 {"status":"ok"}` or `503 {"status":"unavailable"}` with `Cache-Control: no-store`, and logs only the error class.

**Reason.** Phase 1 exit criterion and Phase 10 container health check; driver error messages can contain host and user names.

## 2026-10-17 — Test database safety

**Decision.** Test helpers point `DATABASE_URL` at `DATABASE_URL_TEST` and refuse to run unless that database name ends in `_test`.

**Reason.** Spec §5.3 requires resetting the test database before each run; this makes it impossible for a configuration mistake to reset development data.

## 2026-10-18 — Automatic reset of the test database (owner-approved)

**Decision.** Before each integration and E2E run, `tests/support/reset-database.ts` drops and recreates the `public` schema of the test database and runs `prisma migrate deploy`. It refuses any database whose name does not end in `_test` and any host that is not loopback.

**Reason.** Spec §5.3 requires a reset before each run. Prisma refuses `prisma migrate reset` when an AI agent runs it unless the user consents each time. **The owner approved (2026-10-18) standing automatic resets of the local `_test` database only**, so the reset is implemented directly with those two guards instead of prompting on every run.

**Alternatives.** Consent per run via Prisma's prompt (rejected by the owner as too slow); owner runs integration/E2E tests manually.

## 2026-10-17 — E2E server mode

**Decision.** Playwright starts a production build (`next build && next start`) on port 3100 by default; `E2E_DEV=1` switches to `next dev`.

**Reason.** Production output is what users get (caching, prerendering, React Compiler); a separate port avoids clashing with a running dev server.

## 2026-10-17 — Git hooks

**Decision.** `simple-git-hooks` (pre-commit: format check, lint, typecheck, unit tests), installed by the root `prepare` script.

**Reason.** Zero dependencies and no downloaded binary (unlike lefthook). Integration and E2E tests need Docker services, so they are not part of the hook.

## 2026-10-18 — Accepted audit finding: `braces` (GHSA-vfj7-8cjw-p6xm)

**Decision.** Accept for now; re-check every phase.

**Reason.** `pnpm audit` reports one high-severity stack-exhaustion DoS in `braces ≤ 3.0.3` with **no patched version**. It is reachable only through development tooling (`eslint-config-next` → `@next/eslint-plugin-next`, and the `shadcn` CLI), which only expands glob patterns written by us. `pnpm audit --prod` reports no vulnerabilities. No ignore rule is configured, so the finding stays visible until a fix ships.

## 2026-10-17 — Dependencies added in Phase 1

| Package                                                                         | Why                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `@prisma/client`, `@prisma/adapter-pg`, `pg`, `prisma` (dev), `@types/pg` (dev) | ORM and PostgreSQL driver adapter (spec §4)              |
| `zod`                                                                           | Validation at every boundary (spec §4)                   |
| `server-only`                                                                   | Marks server-only modules (spec §5.1 Data Access Layer)  |
| `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`              | Installed by the shadcn CLI for its components (spec §4) |
| `shadcn`, `tw-animate-css` (dev)                                                | CSS imported by `globals.css` at build time              |
| `prettier` (dev)                                                                | Formatting (spec §5.2)                                   |
| `vitest`, `@vitest/coverage-v8` (dev)                                           | Unit/integration tests and coverage (spec §5.3)          |
| `@playwright/test`, `@axe-core/playwright` (dev)                                | E2E and accessibility tests (spec §5.3)                  |
| `simple-git-hooks` (dev)                                                        | Pre-commit hook (spec §5.4)                              |
