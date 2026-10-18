# Digital Products Store

A bilingual (Arabic / English) store that sells downloadable digital products, built with Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (Base UI), Prisma 7 and PostgreSQL 18.

- Specification: [`context/MASTER_PROMPT.md`](context/MASTER_PROMPT.md)
- Plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Progress: [`docs/PROGRESS.md`](docs/PROGRESS.md)

## Prerequisites

| Tool                    | Version                                         |
| ----------------------- | ----------------------------------------------- |
| Node.js                 | 22.12 or newer (24 LTS recommended)             |
| pnpm                    | 11 (`corepack enable` picks the pinned version) |
| Docker + Docker Compose | Docker Desktop or Engine with Compose v2+       |

## First-time setup

```bash
# 1. Install dependencies (also generates the Prisma client and installs the git hooks)
pnpm install

# 2. Create your local environment file and replace every "change-me" value
cp .env.example .env.local

# 3. Start PostgreSQL 18, Mailpit and MinIO (waits until they are healthy)
pnpm services:up

# 4. (Playwright only) download the test browser once
pnpm exec playwright install chromium
```

The first `services:up` creates a **non-superuser** database role (`APP_DB_USER`) that owns three databases: `<APP_DB_NAME>` (development), `<APP_DB_NAME>_shadow` (Prisma migrations) and `<APP_DB_NAME>_test` (automated tests). If you change the database credentials later, recreate the volume: `docker compose --env-file .env.local down -v`.

## Running

```bash
pnpm dev                 # http://localhost:3000
curl localhost:3000/api/health   # {"status":"ok","checks":{"database":"ok"}}
```

## Local services

All ports listen on `127.0.0.1` only and use project-specific numbers so they do not collide with other projects.

| Service              | Address                                            |
| -------------------- | -------------------------------------------------- |
| Next.js (dev)        | http://localhost:3000                              |
| Next.js (E2E server) | http://localhost:3100                              |
| PostgreSQL 18        | `127.0.0.1:5462`                                   |
| Mailpit (SMTP)       | `127.0.0.1:1032`                                   |
| Mailpit (UI / API)   | http://127.0.0.1:8032                              |
| MinIO (S3 API)       | http://127.0.0.1:9010                              |
| MinIO (console)      | http://127.0.0.1:9011 (log in with `MINIO_ROOT_*`) |

## Scripts

| Script                                                 | What it does                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`               | Next.js development server, production build, production server                  |
| `pnpm lint`                                            | ESLint with zero warnings allowed                                                |
| `pnpm typecheck`                                       | Generates route types, then runs `tsc`                                           |
| `pnpm format` / `pnpm format:check`                    | Prettier                                                                         |
| `pnpm test`                                            | All Vitest projects (unit + integration)                                         |
| `pnpm test:unit` / `pnpm test:integration`             | One Vitest project                                                               |
| `pnpm test:coverage`                                   | Vitest with V8 coverage (`coverage/`)                                            |
| `pnpm test:e2e`                                        | Playwright against a production build on port 3100 (`E2E_DEV=1` uses `next dev`) |
| `pnpm check`                                           | Format check, lint, typecheck and all Vitest tests                               |
| `pnpm db:migrate` / `pnpm db:deploy`                   | `prisma migrate dev` (development) / `prisma migrate deploy` (production)        |
| `pnpm db:generate` / `pnpm db:studio`                  | Regenerate the Prisma client / open Prisma Studio                                |
| `pnpm services:up` / `services:down` / `services:logs` | Manage the Docker services using `.env.local`                                    |

## Testing

- **Unit tests** (`tests/unit`) are pure and need no services.
- **Integration tests** (`tests/integration`) and **E2E tests** (`tests/e2e`) use the separate test database from `DATABASE_URL_TEST`, which is reset before each run. The helpers refuse any database whose name does not end in `_test`.
- A pre-commit hook runs format check, lint, typecheck and unit tests.

## Project layout

```text
app/            routes (App Router); api/health is the readiness probe
components/ui/  shadcn/ui components (installed by the CLI)
lib/env/        Zod-validated environment (validated at server start by instrumentation.ts)
lib/db/         Prisma client (PostgreSQL driver adapter with a pool) and health check
prisma/         schema and migrations; prisma.config.ts holds connection settings
docker/         init scripts and images for the local services
tests/          unit/, integration/, e2e/, support/
docs/           plan, decisions, progress (security and deployment docs come later)
```
