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

---

# Phase 2 — Visual Foundation

## 2026-10-18 — Package pins aligned with spec §17.5 §1

**Decision.** `prisma`, `@prisma/client`, `@prisma/adapter-pg` → `~7.10.0`; `zod` → `^4.6.0`. Every range was checked with `npm view <pkg> versions` before it was written.

**Reason.** The owner added Section 17.5 to the specification, which takes precedence over earlier sections.

## 2026-10-18 — Locale is a root param

**Decision.** `app/[locale]/layout.tsx` is the root layout (no `app/layout.tsx`). `i18n/request.ts` reads the locale with `next/root-params` instead of `setRequestLocale`.

**Reason.** Next.js 16.3+ exposes dynamic segments above the root layout as root params, and next-intl 4.14 reads them directly, so every page prerenders per locale under Cache Components without passing the locale around. The build confirms `/ar` and `/en` are fully static.

**Consequence.** Unmatched URLs fall back to Next.js's default 404 until Phase 9 adds translated 404 pages (likely with `global-not-found`, which the docs recommend for dynamic root segments).

## 2026-10-18 — Latin digits and Gregorian calendar through named formats

**Decision.** `i18n/formats.ts` defines named number/date formats that all set `numberingSystem: "latn"` (dates also `calendar: "gregory"`), passed to both `getRequestConfig` and `NextIntlClientProvider`. All formatting uses these names; messages use `{x, number, <name>}` / `{x, date, <name>}`. Unit tests reject bare `{x, number}` / `{x, date}` arguments, unknown format names and `#`.

**Reason.** next-intl passes its locale straight to `Intl` and has no global default options. Node's ICU (CLDR 48) formats `ar` with Latin digits, but `ar-SA` and `ar-EG` default to Arabic-Indic digits (and `ar-SA` to Umm al-Qura), and browsers ship their own ICU data — so relying on defaults risks inconsistent output and hydration mismatches. Plural `#` always uses the locale default, hence its ban.

**Alternatives.** Using the extended tag (`ar-SA-u-nu-latn-ca-gregory`) as the next-intl locale with a `/ar` prefix mapping: rejected because the tag would leak into `<html lang>`, cookies, `hreflang`, root params and stored `locale` columns.

## 2026-10-18 — Store time zone

**Decision.** `TIME_ZONE = "Asia/Riyadh"` for all date formatting, on the server and in the client provider.

**Reason.** Server and browser must agree (next-intl warns otherwise), and the store operates in Saudi Arabia. Revisit if the owner wants per-visitor time zones.

## 2026-10-18 — Messages shipped to the browser

**Decision.** The root `NextIntlClientProvider` receives only the `common` namespace. Client components in other areas (auth forms, admin) will get a nested provider with their own namespace.

**Reason.** Minimal client JavaScript (spec §12); admin and email strings never reach storefront visitors.

## 2026-10-18 — Twemoji: parser and self-hosted assets

**Decision.** `@twemoji/parser` 17.0.2 (jdecked fork, MIT) runs only on the server (`lib/emoji` imports `server-only`). The 4,009 SVGs of jdecked/twemoji **v17.0.3** are vendored in `public/twemoji` (~10 MB, ~1.8 MB compressed) together with `LICENSE-GRAPHICS.txt` and `VERSION`. `pnpm twemoji:sync` reproduces them from the tag archive and verifies its SHA-256 (`a0855654…5fca`). Images are served with `Cache-Control: public, max-age=2592000`.

**Reason.** Spec §7.6 requires self-hosted images and no client-side parser. Vendoring makes builds deterministic and offline-capable. The npm package `@twemoji/svg` was rejected: it is published by an unrelated third party and contains the older v15 set. Tests prove every URL the parser can produce exists and scan the SVGs for active content.

## 2026-10-18 — Theme tokens

**Decision.** Keep shadcn's neutral palette and add a blue brand primary: light `oklch(0.47 0.13 250)` (6.5:1 against its white foreground), dark `oklch(0.78 0.11 245)` (9.0:1 against its foreground). `color-scheme` is set per theme; Tailwind's `dark` variant matches `.dark` on `<html>` itself and its descendants.

**Reason.** WCAG 2.2 AA in both themes (spec §5.2, §7.5); axe runs on all four locale/theme combinations. The owner can retune the tokens; logos come later from settings.

## 2026-10-18 — Direction lint rule

**Decision.** A local ESLint rule (`eslint-rules/no-physical-direction-classes.mjs`) rejects physical Tailwind utilities in `className` and `cn`/`cva`/`clsx`/`cx`/`twMerge` arguments unless they sit behind `rtl:`/`ltr:`. Suggestions use Tailwind 4.2+'s canonical logical names (`inset-s`/`inset-e` for `left`/`right`).

**Reason.** Spec §7.2 asks for a lint rule or checklist; a rule enforces it on every commit through the pre-commit hook. No new dependency.

## 2026-10-18 — Language switcher accessibility

**Decision.** The switcher link's accessible name is the visible language name (`English` / `العربية`, with `lang` and `hreflang`); the explanatory sentence is a `title`.

**Reason.** An `aria-label` that omits the visible text fails WCAG 2.5.3 (Label in Name).

## 2026-10-18 — Visual snapshot baselines

**Decision.** Playwright snapshots are committed as `*-chromium-win32.png` (the development machine).

**Reason.** Font rasterization differs per OS. When CI is introduced it should run Playwright in its official Docker image and commit Linux baselines alongside.

## 2026-10-18 — Dependencies added in Phase 2

| Package                                                    | Why                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `next-intl`                                                | Locale routing, messages and Intl formatting (spec §4)  |
| `next-themes`                                              | Light/dark/system theming without flash (spec §4)       |
| `@twemoji/parser`                                          | Server-side emoji detection for Twemoji (spec §4, §7.6) |
| `components/ui/dropdown-menu` (shadcn CLI, no new package) | Accessible theme menu                                   |

`next-intl` brings `@swc/core` and `@parcel/watcher` for its optional message extractor (unused); their install scripts are denied in `allowBuilds`.

---

# Phase 3 — Database and Authentication

## 2026-10-21 — Data model conventions

**Decision.** All tables and columns are snake_case (`@@map` / `@map`), every timestamp is `timestamptz(3)`, and IDs default to `uuidv7()`. Rules Prisma cannot express live in the initial migration SQL and are listed next to their models: CHECKs (non-negative money, `total = subtotal − discount + tax`, coupon value ranges, upper-case coupon codes, settings ranges, singleton settings row), partial unique indexes (one owner, one product cover, one active single-use coupon redemption per customer) and the order-number sequence starting at 100001. `prisma migrate diff` confirms the schema and migrations stay in sync.

**Reason.** Spec §9. Database-level guarantees hold even if application code is wrong: there can never be a second owner, a customer with a username, or an order whose total does not add up.

**Details worth knowing.**

- `Order.provider` is null only for zero-total orders (CHECK), which skip the gateway (§17.5 §6).
- `OrderItem.unitChargedMinor` keeps the line price actually sent to the gateway, so Paddle webhooks can compare line items (§17.5 §3).
- `Order.couponOvershoot` flags paid orders accepted beyond a coupon's limits (§17.5 §9).
- `CouponRedemption.singleUse` snapshots `!allowMultiplePerCustomer`, so the partial unique index can enforce "one active redemption per customer" without reading the coupon table.
- Tax rate is stored in basis points (`1500` = 15 %), never as a float.
- Images get their own `ProductImage` table (cover + gallery, with dimensions for `next/image`).
- `RateLimitBucket` backs both Better Auth's limiter and the app's own limits.

## 2026-10-21 — Better Auth tables written by hand, validated by Better Auth

**Decision.** The `User`, `Session`, `Account` and `Verification` models were written from Better Auth's own `getAuthTables()` output instead of adding its CLI. Better Auth 1.7 validates the Prisma data model against its configuration at startup (`database.validateSchema`), and the integration tests run against it. IDs use `advanced.database.generateId: "uuid"`, which on PostgreSQL leaves the column default (`uuidv7()`) in charge.

**Reason.** Fewer dependencies (rule 4); the runtime check catches any drift the CLI would have caught.

## 2026-10-21 — Better Auth version and pnpm's release-age guard

**Decision.** Better Auth `~1.7.12` (latest patch, spec §5.1). When it was added the release was 23 hours old and pnpm 11 added a `minimumReleaseAgeExclude` entry; that entry was removed once the release passed pnpm's 24-hour guard instead of keeping a permanent exception.

## 2026-10-21 — Authentication requests go through the Better Auth handler

**Decision.** Forms call Better Auth's browser client, so every sign-in, sign-up, magic-link and reset request passes through `/api/auth/*`, where Better Auth's rate limiter, origin/CSRF checks, plugins and our policy hook all apply. The `nextCookies()` plugin is installed for Server Actions that call `auth.api` (account settings in Phase 8).

**Reason.** Better Auth only rate-limits HTTP requests; `auth.api` calls from Server Actions would bypass the limiter.

## 2026-10-21 — Policy hook (spec §17.5 §7)

**Decision.** `lib/auth/policy.ts` is the `hooks.before` middleware. Paths were taken from the installed 1.7.12 source (`/sign-up/email`, `/sign-in/email`, `/sign-in/username`, `/sign-in/magic-link`, `/request-password-reset`, `/update-user`; there is no `/forget-password` any more). Every rule has an integration test through the real handler.

- **Sign-up** accepts only `name`, `email`, `password`, `callbackURL`, `rememberMe` and `preferredLocale`; anything else (`role`, `username`, `banned`, `emailVerified`, `image`…) is rejected with `FIELD_NOT_ALLOWED`. The name is always derived from the email.
- **Email sign-in** of the owner: the password is hashed anyway (same timing) and the response is exactly `INVALID_EMAIL_OR_PASSWORD`.
- **Username sign-in** of a non-owner returns `INVALID_USERNAME_OR_PASSWORD`. A database CHECK already makes customer usernames impossible.
- **Magic links** for the owner, banned or unknown accounts get the normal `{ status: true }` answer and no token is created.
- **`/update-user`** is disabled over HTTP and the hook still rejects protected fields for server-side calls.
- **Backstop:** `databaseHooks.session.create` refuses sessions for banned users, for the owner on customer paths and for customers on the owner path, and stores the IP address only as a keyed hash.

**Disabled endpoints.** `/is-username-available`, `/update-user`, `/update-session`, `/change-email`, `/delete-user`, `/delete-user/callback`, social sign-in and account-linking routes, `/account-info`, `/refresh-token`, `/get-access-token`. Email change and account deletion arrive with the account page in Phase 8 (deletion must follow §17.5 §5).

## 2026-10-21 — Magic links for unverified customers

**Decision.** An existing, unverified customer may use a magic link; opening it proves control of the address, and Better Auth then marks the email verified and revokes any credential password set before the address was proven.

**Reason.** Equivalent to email verification, and it protects the real owner of an address that someone else pre-registered. Account creation through magic links stays disabled.

## 2026-10-21 — Rate limits

**Decision.** Per IP (Better Auth custom rules): email sign-in 5/min; owner sign-in 5 per 15 min; magic-link requests 3 per 5 min; magic-link verification 10/min; password-reset requests 3 per 15 min; password resets 5 per 15 min; verification resends 3 per 15 min; sign-up 5/hour; password changes 5 per 15 min; everything else 100/min. Per account (policy hook): 10 sign-in attempts per 15 minutes per email or username, across all IPs.

The limiter uses a custom PostgreSQL storage (`lib/rate-limit`): one atomic `INSERT … ON CONFLICT DO UPDATE` per request, keyed by an HMAC of Better Auth's key, so no IP address is stored. Stale buckets are deleted by the maintenance task (Phase 6).

**Client IP.** `AUTH_IP_HEADERS` (default `x-forwarded-for`) and `AUTH_TRUSTED_PROXIES`. Without trusted proxies Better Auth accepts only a single-value header; behind a reverse proxy that appends to `X-Forwarded-For`, list the proxy addresses (documented in `docs/DEPLOYMENT.md` in Phase 10).

**Trade-off.** The per-account limit can be used to lock an account for 15 minutes; it applies to the owner too, who still has the offline recovery script.

## 2026-10-21 — Hashing personal identifiers

**Decision.** `lib/security/keyed-hash.ts` derives a per-purpose HMAC-SHA256 key from `BETTER_AUTH_SECRET`. Session IP addresses and rate-limit keys are stored only as these hashes. Verification identifiers (password-reset tokens) and magic-link tokens are stored hashed by Better Auth (`verification.storeIdentifier: "hashed"`, `storeToken: "hashed"`).

**Reason.** Spec §5.1 (IP addresses only as hashes). Unkeyed SHA-256 of an IPv4 address is reversible by brute force.

## 2026-10-21 — Session cookie cache and fresh reads

**Decision.** Better Auth's signed cookie cache is on (5 minutes, spec §6.3). `getSessionUser()` uses it for display purposes; `requireOwner()` and, from Phase 5 on, every mutation read the session fresh from the database (`disableCookieCache`), so a revoked session (password reset, ban) is refused immediately where it matters.

## 2026-10-21 — Emails: React Email 6 and fetch-based transports

**Decision.** Templates use the `react-email` package. React Email 6 moved all components and `render` into it and deprecated `@react-email/components`. Sending uses two small `fetch` transports: Resend's REST API in production and Mailpit's HTTP send API in development and tests. Emails are sent in the language stored on the account (`preferredLocale`, set from the page language at sign-up) and after the response, so requests for existing and unknown addresses take the same time.

**Reason.** One documented endpoint each does not justify an SDK (rule 4). `react-email` declares its preview CLI's tooling as runtime dependencies; only the components and `render` are imported, so the server bundle stays small.

## 2026-10-21 — Verification flow

**Decision.** `autoSignInAfterVerification: false`. Links sent at sign-up land on `/[locale]/verify-email?status=verified`, which leads to sign-in. Links re-sent by a sign-in attempt land on `/`, because passing a callback URL to sign-in would also redirect successful sign-ins.

## 2026-10-21 — Test doubles for external services (loopback only)

**Decision.** `TEST_DOUBLES=on` replaces Cloudflare Turnstile with a local check of Cloudflare's documented test token and switches off the Have I Been Pwned lookup. The environment schema refuses it unless `APP_URL` is a loopback address, so a deployed server can never enable it. Integration tests also build an auth instance with test doubles off and stub `fetch` to cover the real Turnstile and HIBP plugins. Phase 6 uses the same switch for the fake payment adapter.

**Reason.** Spec §5.3: tests never call live services. Production builds run locally (E2E against `next start`) also need the doubles, so `NODE_ENV` alone cannot be the guard.

## 2026-10-21 — Turnstile site key at request time

**Decision.** `TURNSTILE_SITE_KEY` is a server variable read when the sign-up page renders and passed to the widget, not a `NEXT_PUBLIC_` variable.

**Reason.** It is public by design, but build-time inlining would bake it into the Docker image.

## 2026-10-21 — Owner provisioning and recovery

**Decision.** `pnpm db:seed` creates the singleton settings row and, if no owner exists, the owner from `OWNER_*` variables (idempotent: an existing owner is never changed). `pnpm owner:reset-password` prompts for a new password without echoing it (or reads it from stdin), stores it with Better Auth's `hashPassword` and deletes every owner session. Both check the password against Have I Been Pwned and refuse to continue if the service is unreachable, unless `TEST_DOUBLES=on` on a loopback `APP_URL`.

## 2026-10-21 — Two root layouts and HTTP status codes

**Decision.** `app/[locale]/(store)/layout.tsx` is the static root layout of the storefront. `app/[locale]/(secure)/layout.tsx` is a dynamic root layout (it waits for the request) for authentication pages, the account area and the admin; checkout joins it in Phase 6 and the per-request CSP nonce in Phase 9 (§17.5 §2).

**Status codes.** With Cache Components the server commits to `200` before a guard that awaits the database can run, so the layouts' `notFound()` and `redirect()` render a 404 page (marked `noindex`) or a client-side redirect. Next.js documents proxy as the place for real status codes, so `proxy.ts` answers optimistically: guests are redirected from `/account` and `/checkout` (307), and `/admin` returns a genuine 404 to requests without a session cookie or whose signed session cache shows a non-owner role. The layouts and the DAL remain the security boundary; the proxy only improves status codes.

## 2026-10-21 — Hand-written shadcn/ui inputs

**Decision.** `components/ui/input.tsx`, `label.tsx` and `checkbox.tsx` were written in the base-nova style on Base UI, because the shadcn registry (`ui.shadcn.com`) is not reachable from the build environment. Each file notes it should be kept in sync with `shadcn add`.

## 2026-10-21 — ES modules and CLI scripts

**Decision.** `package.json` declares `"type": "module"`. CLI scripts run with `tsx` (dev dependency), which resolves the `@/` path aliases.

**Reason.** Prisma 7's generated client is an ES module (`import.meta`); Playwright and plain Node otherwise load the test fixtures as CommonJS and fail. Prisma's documentation gives this exact fix.

## 2026-10-21 — Playwright browser and Linux baselines

**Decision.** `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` lets Playwright use a locally installed Chromium when the bundled revision cannot be downloaded. Linux visual baselines (`*-chromium-linux.png`) are committed next to the Windows ones.

**⚠ Owner action.** The header gained the account link, so the Windows home-page baselines from Phase 2 are outdated: regenerate them on the development machine with `pnpm test:e2e --update-snapshots`.

## 2026-10-21 — Dependencies added in Phase 3

| Package                        | Why                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `better-auth`                  | Authentication (spec §4); brings its Prisma adapter, `better-call` and `jose` |
| `react-email`                  | Email templates and rendering (spec §4)                                       |
| `tsx` (dev)                    | Runs the TypeScript CLI scripts (`db:seed`, `owner:reset-password`)           |
| `components/ui/*` (no package) | Input, Label, Checkbox on the already-installed Base UI                       |

---

# Phase 4 — Catalog

## 2026-10-21 — Fully static catalog pages, enforced by the build

**Decision.** The home, product and category pages export `ensureStatic = "navigation"`, the only level that Next.js validates during `next build`: any uncached data, `cookies()`, `headers()`, server `searchParams` or short-lived cache in those routes fails the build, even inside `<Suspense>`. This was verified by adding a `headers()` call to the shared footer; the build failed on the product route. `/products` keeps a static shell and renders its query-dependent results in `<Suspense>` (spec §8.1).

**Reason.** Spec §12 and §17.5 §2: catalog routes must stay static (they get the static CSP without nonces in Phase 9).

## 2026-10-21 — Personal header UI is resolved in the browser

**Decision.** The header's account link became a small client component that reads `/api/auth/get-session` after hydration (served from Better Auth's signed cookie cache). The server and the first client render show the guest link. The Phase 6 cart count will work the same way.

**Reason.** `ensureStatic = "navigation"` forbids request-time data anywhere in the route, including a session read streamed inside `<Suspense>` in the shared layout. A browser read is the documented exception and avoids shipping the Better Auth client to every page.

## 2026-10-21 — Prerendering needs the database at build time

**Decision.** `generateStaticParams` lists every published product and every category; products published later render on their first visit and are then served statically. With Cache Components the list must not be empty, so an empty catalog returns a placeholder slug that renders the 404 page.

**⚠ Owner note.** Production builds therefore need read access to the database (and `APP_URL` and `S3_PUBLIC_BASE_URL`, which end up in prerendered HTML and in the image allowlist). Phase 10 documents this for Coolify/Dokploy builds.

## 2026-10-21 — Cached reads and tags

**Decision.** `features/*/data.ts` hold plain Prisma reads (integration-tested); `features/*/queries.ts` wrap them with `'use cache'`, the tags `products`, `product:{id}`, `categories` and `settings`, and `cacheLife("days")` (`"hours"` for search results). Cached values are plain data: the exchange rate leaves the database as a six-decimal string, never a Prisma `Decimal`. Phase 5 calls `updateTag` with the same names, so the daily lifetime is only a safety net.

## 2026-10-21 — Search

**Decision.** Case-insensitive `ILIKE` on titles and short descriptions in both languages, filtered by category and sorted by newest or price, 12 per page. LIKE wildcards in the query are escaped explicitly: Prisma passes `contains` values into the pattern unescaped, which a test caught (`%` matched every product). Query-string values that fail validation fall back to defaults, and unknown parameters (`utm_*`) are ignored so shared links keep working.

**Limitation.** No Arabic normalization yet (alef/hamza forms, taa marbuta, diacritics in stored text). If the catalog grows, add normalized search columns or `pg_trgm`.

## 2026-10-21 — Money in Phase 4

**Decision.** `lib/money` converts USD cents to SAR halalas with integer-only `BigInt` arithmetic on the six-decimal rate and one rule: round half up to the nearest halala. A fixed SAR price set by the owner overrides the conversion. Prices are displayed as USD with SAR beneath; a price of zero shows "Free".

**Display detail.** Currency symbols are bidi-isolated (`formatToParts` with the shared named formats, symbol in `<bdi>`): inside Arabic text "US$" would otherwise render as "$US", while "ر.س." keeps its own right-to-left order.

## 2026-10-21 — Rich-text sanitizer

**Decision.** `sanitize-html` with an allowlist: paragraphs, headings h2–h4, lists, emphasis, blockquote, code, `hr` and links. Links may use only `http`, `https` and `mailto`, and always get `rel="noopener noreferrer nofollow" target="_blank"`. Only `ltr`/`rtl`/`auto` are allowed as `dir` values; no styles, classes, images or event handlers. The same allowlist runs on write (Phase 5) and again on every render. On render its `textFilter` swaps emoji in the already-escaped text for Twemoji `<img>` tags built from parser output, so emoji in descriptions look the same everywhere without loosening the allowlist.

**Reason.** Spec §5.1 and §17.5 §2: on catalog pages (no nonce) the sanitizer is the primary XSS defense. Tests cover script tags, event handlers, `javascript:`/`data:`/entity-encoded URLs, SVG payloads and escaped markup, and an E2E probe proves nothing in a hostile description runs.

## 2026-10-21 — Slugs and text length

**Decision.** `slugify()` keeps Arabic letters (so Arabic-only titles get readable slugs), removes emoji (including ZWJ sequences, flags, keycaps and skin tones), Arabic diacritics and tatweel, folds Latin accents, turns Arabic-Indic digits into Latin digits and joins words with hyphens (at most 80 characters). `graphemeLength()` and `graphemeString()` count user-perceived characters with `Intl.Segmenter` (spec §7.6).

## 2026-10-21 — SEO

**Decision.** Both root layouts set `metadataBase` from `APP_URL`. Storefront pages are `index, follow`; authentication, account and admin pages are `noindex`. Every catalog page has a canonical URL and `hreflang` alternates for `ar`, `en` and `x-default` (the unprefixed path, which `proxy.ts` sends to the visitor's language), plus Open Graph data with `ar_SA`/`en_US` locales. Product pages carry schema.org `Product` JSON-LD with an exact USD price; `<` is escaped so no value can close the script element. `/sitemap.xml` lists every public page in both languages with alternates; `/robots.txt` disallows `/api/` and the admin, account and checkout areas.

## 2026-10-21 — Images

**Decision.** `next/image` with AVIF then WebP, `qualities: [75]` (required since Next.js 16) and `remotePatterns` limited to `S3_PUBLIC_BASE_URL`. Optimizing from private IPs (local MinIO) is allowed only in development (superseded in Phase 5: only when the public bucket is on loopback). Only the main product image is preloaded (LCP). Products without images show a neutral placeholder.

## 2026-10-21 — Demo catalog and E2E data

**Decision.** `pnpm db:seed:demo` loads a small bilingual catalog for local work until the admin can create products (Phase 5). It is refused unless `APP_URL` is a loopback address. E2E runs reset and seed the test database before `next build`, inside Playwright's web-server command, because catalog pages are prerendered from it. The global setup that used to reset the database after the server started was removed.

## 2026-10-21 — Counts in messages

**Decision.** Counts use plural-free phrasing ("عدد النتائج: 18" / "Results: 18").

**Reason.** Arabic has six plural categories and English two, so ICU plural messages would differ in their placeholders and fail the cross-locale parity test that keeps translations in sync.

## 2026-10-21 — Dependencies added in Phase 4

| Package                      | Why                                                   |
| ---------------------------- | ----------------------------------------------------- |
| `sanitize-html`              | Allowlist sanitizer for product rich text (spec §5.1) |
| `@types/sanitize-html` (dev) | Types for it                                          |

## 2026-10-21 — Owner uploads: pre-signed PUT, signed tickets, storage verification (§17.5 §8)

**Decision.**

- The browser uploads straight to storage with a **pre-signed PUT** to a server-generated key `pending/{uuid}` in the **private** bucket. `Content-Type` and `Content-Length` are part of the signature (the presigner leaves `Content-Type` unsigned unless asked), so storage itself rejects a body of another type or size (verified against MinIO).
- The type is chosen by the server from an **extension allowlist** (`lib/storage/policy.ts`); the browser's MIME guess is ignored because it is often empty or wrong. SVG, HTML, scripts and executables are never accepted. Limits: images 5 MiB and 100–10,000 px per side; files 2 GiB (one PUT; S3 allows 5 GiB).
- The upload URL comes with a **signed ticket** (HMAC with a key derived from `BETTER_AUTH_SECRET`, 15-minute expiry) holding the key, product, slot, type, sanitized file name and declared size. Confirmation accepts nothing else, so it can never point at a key, product or slot the server did not issue, without a pending-uploads table.
- On confirmation the server calls `HeadObject`, takes size, ETag and type **from storage**, re-checks the limits, reads the first bytes to match the format's **signature** (PDF, ZIP family, PNG, JPEG, WebP, AVIF, MP3/MP4/WAV, fonts, PSD, 7z, RAR), reads images completely to measure them with `image-size` (EXIF rotation respected), then server-side copies the object to its final key — `products/{id}/files/{uuid}` in the private bucket, or `products/{id}/images/{uuid}.{ext}` in the public bucket with an immutable cache header — records it, and deletes the pending object. Any refusal deletes the pending object.
- A new version supersedes the previous one with a conditional update (`supersededAt`), version + 1. Removing a file that has been downloaded only marks it superseded; a file never downloaded is deleted with its object. A published product keeps at least one file.
- Pre-signed **POST** policies (which can enforce a size range) were rejected because Cloudflare R2 does not support them.

**Consequence.** Unconfirmed `pending/` objects are cleaned up by the maintenance task (Phase 6). Production buckets need CORS rules allowing `PUT` from the store's origin (documented in Phase 10). The local MinIO now also allows the E2E origin `http://localhost:3100`.

## 2026-10-21 — Owner Server Actions

**Decision.** Each action calls `requireOwner()` (fresh session read), validates with Zod (strict objects; unknown keys rejected), runs an audited service function in one transaction, then calls `updateTag`. Services live in `features/*/service.ts` and take the database client as a parameter, so integration tests run them and the actions against the real database. Actions return **translation keys** (`admin.errors.*`, `admin.notices.*`), never text: `next/root-params` is not available in Server Actions, so they cannot know the visitor's language. Expected failures are `ActionError`s; Zod errors map to "invalid"; anything else is logged and shown generically.

Forms call the action from `onSubmit` inside a transition instead of `<form action>`, so React's automatic form reset does not wipe typed values or rich-text state after a validation error. A product form requires JavaScript anyway (the editor).

**Cache tags.** Product writes update `products`, `categories` (published counts) and `product:{id}`; category writes update `categories` and `products` (cards show category names); the exchange rate updates `settings` and `products`.

## 2026-10-21 — Product lifecycle rules

**Decision.** New products start as drafts. Publishing requires at least one current file and keeps the first `publishedAt` on re-publication ("newest first" stays stable). A product that has been sold can be archived but never returns to draft and is never deleted; only unsold, never-downloaded drafts can be deleted, together with their images and files. Archived products disappear from the store.

## 2026-10-21 — Audit log format

**Decision.** `AuditLog.diff` is `{ changes: { field: { from, to } } }` with only the fields that changed (timestamps ignored; dates, BigInts and Decimals as strings), plus `details` for actions that are not field changes (reorders). Creations diff against nothing, deletions against nothing on the other side. The row is written in the same transaction as the change.

## 2026-10-21 — Dashboard tables without TanStack Table

**Decision.** The product list is a Server Component built from the shadcn/ui `Table` primitives with server-side pagination (20 per page), sorting (`aria-sort`, links) and filtering (status, search) driven by the URL and validated with Zod. shadcn's Data Table recipe adds TanStack Table for client-side state, which server-side pagination and sorting do not need; leaving it out keeps the dashboard light and every state linkable.

## 2026-10-21 — Rich-text editor and emoji picker

**Decision.** Tiptap 3 (StarterKit with headings 2–3, lists, quotes, links; code, strike, underline and rules disabled) so the editor can only produce what the sanitizer keeps. It is loaded with `next/dynamic` and `ssr: false` inside the admin only; the hidden input that carries the HTML lives outside the lazy chunk, so submitting before the editor loads keeps the existing description. Links are limited to http(s) and mailto. The HTML is sanitized again on the server before it is stored and once more when rendered.

The emoji picker is a curated set of 80 single emoji whose grid is loaded on first open and drawn with the self-hosted Twemoji files (a unit test checks every file exists). Emoji are inserted as text; the storefront renders them with Twemoji.

## 2026-10-21 — Optimizing images from local storage

**Decision.** `images.dangerouslyAllowLocalIP` is enabled only when `S3_PUBLIC_BASE_URL` itself is a loopback address (local MinIO), replacing the Phase 4 "development only" rule. The E2E production build then serves real optimized images; a deployment with a real CDN never relaxes the image optimizer's private-address protection.

## 2026-10-21 — E2E ordering and sessions

**Decision.** `admin.spec.ts` runs as a second Playwright project that depends on the storefront project, because publishing products and adding categories change the listings the storefront specs assert. Dashboard specs create the owner's session row directly and set its signed cookie (`tests/support/e2e-session.ts`), so the per-account sign-in limit is not used up; sign-in itself stays covered by `auth.spec.ts`. Integration test files that create catalog data restore it afterwards (`tests/support/catalog-cleanup.ts`), because all files share one database.

## 2026-10-21 — Dependencies added in Phase 5

| Package                                               | Why                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | S3 API for MinIO and R2: pre-signed PUT/GET, HeadObject, server-side copy, listing, deletion |
| `image-size`                                          | Reads image type and dimensions from bytes, without native code                              |
| `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`  | Admin-only rich-text editor, lazy-loaded                                                     |

All are actively maintained; versions were checked with `npm view` and pinned by the lockfile.
