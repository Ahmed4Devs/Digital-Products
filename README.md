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

# 4. Create the database tables, then the owner account and default store settings
pnpm db:migrate
pnpm db:seed
#    Optional, local only: a bilingual demo catalog (until products can be added in the admin)
pnpm db:seed:demo

# 5. (Playwright only) download the test browser once
pnpm exec playwright install chromium
```

`pnpm db:seed` reads the owner's credentials from the `OWNER_*` variables and is safe to re-run: it never changes an existing owner. It checks the password against Have I Been Pwned; on a machine without internet access, run it with `TEST_DOUBLES=on` (local `APP_URL` only).

The first `services:up` creates a **non-superuser** database role (`APP_DB_USER`) that owns three databases: `<APP_DB_NAME>` (development), `<APP_DB_NAME>_shadow` (Prisma migrations) and `<APP_DB_NAME>_test` (automated tests). If you change the database credentials later, recreate the volume: `docker compose --env-file .env.local down -v`.

## Running

```bash
pnpm dev                 # http://localhost:3000
curl localhost:3000/api/health   # {"status":"ok","checks":{"database":"ok"}}
```

- The catalog lives at `/ar` and `/en`, `/[locale]/products`, `/[locale]/products/[slug]` and `/[locale]/categories/[slug]`; `/sitemap.xml` and `/robots.txt` are generated.
- Customers sign up at `/ar/sign-up` (or `/en/sign-up`). Every email (verification, magic link, password reset) lands in Mailpit at http://127.0.0.1:8032.
- The owner signs in at `/ar/admin/sign-in` with `OWNER_USERNAME` and `OWNER_PASSWORD`. That page is not linked anywhere, and the rest of `/admin` answers 404 to everyone else.
- Owner locked out? On the server: `pnpm owner:reset-password` sets a new password and signs the owner out everywhere.

## Environment variables

`.env.example` documents every variable. The ones that need a decision:

| Variable                                      | Purpose                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                          | Signs cookies and tokens and keys the IP hashes. At least 32 random characters (`openssl rand -base64 32`).                                                 |
| `MAIL_FROM`, `RESEND_API_KEY` / `MAILPIT_URL` | Sender address; Resend in production (required there), Mailpit locally.                                                                                     |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`  | Cloudflare Turnstile on sign-up. The example file holds Cloudflare's public test keys.                                                                      |
| `AUTH_IP_HEADERS`, `AUTH_TRUSTED_PROXIES`     | Where the client IP comes from (for rate limits). Behind a reverse proxy, list its addresses in `AUTH_TRUSTED_PROXIES`.                                     |
| `APP_URL`, `S3_PUBLIC_BASE_URL`               | Also needed at **build time**: canonical URLs and sitemap entries are prerendered, and the public image host is baked into the image allowlist.             |
| `OWNER_*`                                     | Read only by `pnpm db:seed`.                                                                                                                                |
| `TEST_DOUBLES`                                | `on` replaces Turnstile and the compromised-password check with local fakes. Refused unless `APP_URL` is a loopback address; tests switch it on themselves. |

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
| `pnpm db:seed`                                         | Owner account (from `OWNER_*`) and default store settings; idempotent            |
| `pnpm db:seed:demo`                                    | Bilingual demo catalog for local development (refused unless `APP_URL` is local) |
| `pnpm owner:reset-password`                            | Offline owner recovery: new password, all owner sessions revoked                 |
| `pnpm twemoji:sync`                                    | Re-vendor the pinned Twemoji SVG set (checksum-verified)                         |
| `pnpm db:generate` / `pnpm db:studio`                  | Regenerate the Prisma client / open Prisma Studio                                |
| `pnpm services:up` / `services:down` / `services:logs` | Manage the Docker services using `.env.local`                                    |

## Testing

- **Unit tests** (`tests/unit`) are pure and need no services.
- **Integration tests** (`tests/integration`) and **E2E tests** (`tests/e2e`) use the separate test database from `DATABASE_URL_TEST`, which is reset before each run. The helpers refuse any database whose name does not end in `_test`. They also need Mailpit (email is read back from its API) and switch `TEST_DOUBLES` on, so no live service is ever called.
- E2E tests run against a production build on port 3100. Before building, `tests/e2e/prepare-database.ts` resets the test database and seeds settings, a test owner and the test catalog, because catalog pages are prerendered from it. A server already running on port 3100 is reused as is. If Playwright's bundled browser cannot be downloaded, point it at a local Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome pnpm test:e2e`.
- `pnpm build` doubles as a test: home, product and category pages use `ensureStatic = "navigation"`, so the build fails if request-time code leaks into them.
- Visual baselines are per operating system (`*-win32.png`, `*-linux.png`); refresh yours after intentional visual changes with `pnpm test:e2e --update-snapshots`.
- A pre-commit hook runs format check, lint, typecheck and unit tests.

## Project layout

```text
app/[locale]/
  (store)/           static root layout (lang, dir, font, providers) + storefront pages:
                     home, products (search), products/[slug], categories/[slug]
  (secure)/          dynamic root layout for auth pages, account area and admin
    (auth)/          sign-in, sign-up, forgot/reset password, verify email
    account/         customer area (guarded by the DAL)
    admin/           owner sign-in and dashboard (404 for everyone but the owner)
app/api/auth/        Better Auth handler (rate limits, policy hooks)
app/api/health/      readiness probe
app/sitemap.ts       /sitemap.xml (both languages, hreflang alternates)
app/robots.ts        /robots.txt
proxy.ts             locale negotiation and optimistic redirects / 404s (never a security boundary)
i18n/                routing, navigation helpers, shared formats, request config
messages/{ar,en}/    translations split by domain (common, store, auth, account, admin, emails)
components/auth/     sign-in, sign-up, magic-link, reset and owner forms (client)
components/catalog/  product cards and grid, filters, pagination, breadcrumbs, JSON-LD
components/layout/   root document, site shell, header, footer, language and theme switchers
components/shared/   EmojiText (server-side Twemoji), LtrText (bidi isolation), PriceDisplay,
                     MoneyText, RichText (sanitized)
components/ui/       shadcn/ui components
emails/              bilingual React Email templates
features/            products, categories, settings: data.ts (Prisma reads), queries.ts
                     ('use cache' + tags), search params
lib/auth/            Better Auth config, policy hooks, DAL guards, client, owner CLI logic
lib/email/           Resend / Mailpit transports and sending
lib/rate-limit/      PostgreSQL-backed fixed-window limiter
lib/security/        keyed hashing for IPs and other identifiers
lib/money/           integer money math: USD→SAR (round half up), fixed SAR prices
lib/text/            slugs, grapheme lengths, bilingual fallback
lib/rich-text/       allowlist sanitizer and render-side Twemoji
lib/seo/             metadata, canonical and hreflang helpers
lib/env/             Zod-validated environment (validated at server start by instrumentation.ts)
lib/db/              Prisma client (PostgreSQL driver adapter with a pool) and health check
lib/emoji/           Twemoji parsing (server only)
scripts/             CLI scripts (owner recovery, demo catalog, Twemoji sync)
public/twemoji/      vendored Twemoji v17.0.3 SVGs (CC-BY 4.0) — refresh with pnpm twemoji:sync
eslint-rules/        local rule that forbids physical left/right Tailwind utilities
prisma/              schema, migrations and seed; prisma.config.ts holds connection settings
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
- **Catalog data:** pages read through `features/*/queries.ts` (cached, tagged); owner mutations must call `updateTag` with the same tags. Only published products reach the storefront.
- **Money:** integer minor units only; convert and round through `lib/money`, display through `PriceDisplay` / `MoneyText`.
- **Rich text:** never render owner HTML except through `RichText`, which re-sanitizes it.
- **Authorization:** read the user through `lib/auth/dal.ts` (`getSessionUser`, `requireCustomer`, `requireVerifiedCustomer`, `requireOwner`) in every page, Server Action and route handler that needs it. Layouts and `proxy.ts` never count as authorization.
