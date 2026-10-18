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
| `pnpm twemoji:sync`                                    | Re-vendor the pinned Twemoji SVG set (checksum-verified)                         |
| `pnpm db:generate` / `pnpm db:studio`                  | Regenerate the Prisma client / open Prisma Studio                                |
| `pnpm services:up` / `services:down` / `services:logs` | Manage the Docker services using `.env.local`                                    |

## Testing

- **Unit tests** (`tests/unit`) are pure and need no services.
- **Integration tests** (`tests/integration`) and **E2E tests** (`tests/e2e`) use the separate test database from `DATABASE_URL_TEST`, which is reset before each run. The helpers refuse any database whose name does not end in `_test`.
- A pre-commit hook runs format check, lint, typecheck and unit tests.

## Project layout

```text
app/[locale]/        root layout (lang, dir, font, providers) and localized routes
  (store)/           storefront shell (header, footer) and pages
app/api/health/      readiness probe
proxy.ts             locale negotiation (optimistic only, never a security boundary)
i18n/                routing, navigation helpers, shared formats, request config
messages/{ar,en}/    translations split by domain (common, store, auth, account, admin, emails)
components/layout/   root document, header, footer, language and theme switchers
components/shared/   EmojiText (server-side Twemoji), LtrText (bidi isolation)
components/ui/       shadcn/ui components (installed by the CLI)
lib/env/             Zod-validated environment (validated at server start by instrumentation.ts)
lib/db/              Prisma client (PostgreSQL driver adapter with a pool) and health check
lib/emoji/           Twemoji parsing (server only)
public/twemoji/      vendored Twemoji v17.0.3 SVGs (CC-BY 4.0) — refresh with pnpm twemoji:sync
eslint-rules/        local rule that forbids physical left/right Tailwind utilities
prisma/              schema and migrations; prisma.config.ts holds connection settings
docker/              init scripts and images for the local services
tests/               unit/, integration/, e2e/, support/
docs/                plan, decisions, progress (security and deployment docs come later)
```

## Conventions

- **Text:** every user-facing string lives in `messages/`; the Arabic file defines the keys and types, and tests require identical keys in English.
- **Numbers and dates:** always format through the named formats in `i18n/formats.ts` (`format.number(x, "usd")`, `{count, number, integer}`) so Arabic pages keep Latin digits and the Gregorian calendar.
- **Direction:** use logical Tailwind utilities (`ms-*`, `pe-*`, `inset-s-*`, `text-start`, `border-e`…); ESLint rejects physical ones unless prefixed with `rtl:` / `ltr:`. Wrap emails, order numbers and usernames inside sentences in `<LtrText>`. Flip directional icons with `rtl:-scale-x-100`.
- **Emoji in content:** render with `<EmojiText>`; keep native emoji in `<title>`, meta tags, inputs and emails.
- **Links:** import `Link`, `redirect`, `usePathname` and `useRouter` from `@/i18n/navigation`.
