# Implementation Plan

> Derived from `context/MASTER_PROMPT.md` (the specification). The spec always wins over this plan; when they disagree, fix this plan.
>
> Every phase ends with: lint + typecheck + all tests green → `docs/PROGRESS.md` updated → Conventional Commit(s) → annotated tag → phase report.

## Conventions used in this plan

- **[T]** = test work that ships in the same phase as the feature.
- **[D]** = decision to record in `docs/DECISIONS.md`.
- **[Q]** = open question for the owner (see "Open questions" at the bottom).
- Local service ports are project-specific to avoid clashing with other Docker projects on the dev machine: PostgreSQL `5462`, Mailpit SMTP `1032` / UI `8032`, MinIO API `9010` / console `9011`, Next.js `3000`.

---

## Phase 1 — Setup and Local Environment → tag `phase-01-setup`

1. Git: init on `main`, complete `.gitignore`, `.gitattributes` (LF for shell scripts mounted into containers). Commit the spec.
2. This plan, `docs/DECISIONS.md`, `docs/PROGRESS.md`.
3. Adopt the existing `create-next-app` 16.4 scaffold:
   - Switch package manager to **pnpm** (`packageManager` field, `pnpm-lock.yaml`, drop `package-lock.json`).
   - Bump to latest patches (Next 16.4.x, React/React DOM 19.3.x), `@types/node` matching Node 24 LTS.
   - `next.config.ts`: Turbopack (default), `cacheComponents: true`, `reactCompiler: true`, `typedRoutes`, `poweredByHeader: false`.
   - TypeScript `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`; scripts `typecheck`, `lint` (`--max-warnings 0`), `format`, `format:check`.
   - Prettier with a shared config; ESLint flat config (Next core-web-vitals + TypeScript) with zero warnings.
   - Remove template assets and template copy.
4. Tailwind CSS 4.3 (CSS-first `@theme`, no `tailwind.config.js`).
5. shadcn/ui CLI v4 init with **Base UI** primitives and **`rtl: true`** in `components.json`; `lib/utils.ts` (`cn`).
6. `docker-compose.yml`:
   - PostgreSQL 18 (named volume at `/var/lib/postgresql` — the PG 18 image layout), UTF-8, init script that creates a **non-superuser** application role owning only the app databases (`app`, `shadow`, `test`).
   - Mailpit (SMTP + web UI + HTTP send API).
   - MinIO + one-shot `mc` job that creates the **private** product-files bucket and a public images bucket.
   - All ports bound to `127.0.0.1` only.
7. Prisma ORM **pinned to `^7`** (`prisma`, `@prisma/client`, `@prisma/adapter-pg`), `prisma.config.ts`, `prisma-client` generator → `generated/prisma`, `pg` driver adapter with a pool, singleton client in `lib/db`.
8. Environment: `lib/env` Zod schemas (server-only), validated at boot through `instrumentation.ts` (fail fast); `.env.example` with placeholders only.
9. Health check route `app/api/health/route.ts` (DB `SELECT 1`, generic JSON, `no-store`, 503 when DB is down).
10. Testing toolchain:
    - Vitest with `unit` and `integration` projects, V8 coverage, `server-only` shim, alias `@/`.
    - Integration DB helper that resets the **separate test database** before each run (drop and recreate the `public` schema, then `prisma migrate deploy`; local `_test` databases only — owner-approved, see DECISIONS).
    - Playwright (Chromium) with `webServer`, base E2E smoke test hitting `/api/health` and `/`.
    - axe-core Playwright package installed (used from Phase 2).
11. Pre-commit hook (`simple-git-hooks`): lint, typecheck, unit tests.
12. `README.md`: prerequisites, setup, running services, scripts, ports.
13. `pnpm audit`.

- **[T]** env schema unit tests; health route integration test against the real DB; E2E smoke.
- **Exit:** app starts, `/api/health` reports DB OK, lint/typecheck/tests pass.

## Phase 2 — Visual Foundation → tag `phase-02-foundation`

1. `next-intl`: `i18n/routing.ts` (`ar` default, `en`; `localePrefix: 'always'`; locale cookie), `i18n/request.ts`, navigation helpers (`Link`, `redirect`, `usePathname`, `useRouter`).
2. `proxy.ts`: next-intl middleware for negotiation (cookie → `Accept-Language`); `/` → `/{locale}`; matcher excludes `api`, `_next`, static files. Structured as a small pipeline so Phase 9 can add per-request nonces for the protected routes of §17.5 §2 without touching catalog routes.
3. `app/[locale]/layout.tsx`: `<html lang dir>` set on the server (`ar` → `rtl`, `en` → `ltr`), `generateStaticParams` for both locales, `setRequestLocale`, `NextIntlClientProvider`, Base UI `DirectionProvider`, `ThemeProvider`. The `<html>` shell lives in a reusable component that accepts an optional nonce, so Phase 9 can give nonce-protected routes their own dynamic root layout (§17.5 §2).
4. Messages split by domain (`messages/{ar,en}/{common,store,auth,account,admin,emails}.json`), merged in `i18n/request.ts`; global `AppConfig` augmentation so missing keys fail `tsc`; a unit test that asserts both locales have identical key sets.
5. Shared formats (`i18n/formats.ts`): Latin digits + Gregorian calendar for `ar` (`ar-SA-u-nu-latn-ca-gregory`), currency formats for USD/SAR, date/time formats.
6. Font: IBM Plex Sans Arabic via `next/font/google` (self-hosted at build), subsets `arabic` + `latin`, `display: swap`, CSS variable wired into `@theme`.
7. Theming: next-themes (class strategy, `system` default, `disableTransitionOnChange`), `@custom-variant dark` bound to `.dark`, oklch tokens for both themes, `color-scheme` per theme.
8. Layout components: header (logo SVG with `currentColor`, nav, cart slot, user slot in `Suspense`), footer (legal links, Twemoji CC-BY attribution), `LanguageSwitcher` (keeps path, sets cookie), `ThemeToggle` (translated labels).
9. Emoji: `lib/emoji` server-side parser → `EmojiText` server component that replaces emoji with self-hosted Twemoji SVGs (`public/twemoji/*.svg`, copied by a script from the pinned `@twemoji/svg` package), `alt` = original emoji, sized to `1em`, `loading="lazy"`, `decoding="async"`.
10. Direction lint guard: ESLint `no-restricted-syntax` rule rejecting physical classes (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `border-l`, `border-r`, `rounded-l/r`…) in `className` string literals.
11. `bdi` helper component for bidirectional fragments; LTR-forced inputs for email/password/URL.

- **[T]** unit: formatting (digits, calendar, currency), emoji renderer (start/middle/end of Arabic & English sentences, ZWJ sequences, flags, keycaps), messages key parity. E2E: smoke + visual snapshots for `ar/rtl` × `en/ltr` × `light` × `dark`; axe on home in all four combos.
- **Exit:** base layout renders correctly in all four combinations.

## Phase 3 — Database and Authentication → tag `phase-03-auth`

1. Full Prisma schema (Section 9) with `@default(dbgenerated("uuidv7()")) @db.Uuid` IDs, enums, `@@unique`, indexes, money as `Int` minor units, exchange rate as `Decimal`, JSONB payloads/diffs. Better Auth tables written from Better Auth's `getAuthTables()` output and validated by its startup schema check (no CLI dependency). Includes the §17.5 fields: `Order.userId` nullable (`SetNull`) + `customerEmailSnapshot` + `providerTaxMode` / `providerTaxMinor`; `ProductFile.supersededAt`; `Coupon.reservedCount` / `allowMultiplePerCustomer`; `CouponRedemption` with a partial unique index on `(couponId, userId)` for active rows; `DownloadLog` cascading from `Entitlement`.
2. Initial migration; constraint checks (`CHECK` price ≥ 0 etc.) via migration SQL where Prisma can't express them.
3. Better Auth server (`lib/auth/server.ts`):
   - Prisma adapter; `emailAndPassword` (`requireEmailVerification`, `minPasswordLength: 8`, `revokeSessionsOnPasswordReset`); compromised-password check.
   - `emailVerification` (send on sign-up, auto sign-in after verify off).
   - `magicLink` with `disableSignUp: true`, short expiry, single use.
   - `username` plugin — sign-in by username only allowed for `role = owner` (hook rejects everyone else); owner blocked from email/password and magic-link sign-in paths (owner email is recovery-only).
   - `user.additionalFields.role` with `input: false`; `name` derived from email local part in a `databaseHooks.user.create.before` hook.
   - Rate limits (database storage): stricter custom rules for `/sign-in/email`, `/sign-in/username`, `/sign-in/magic-link`, `/request-password-reset`, `/sign-up/email`.
   - Cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax`; `trustedOrigins`; session `cookieCache`.
   - `nextCookies()` plugin last.
4. `lib/auth/client.ts` (React client with `usernameClient`, `magicLinkClient`).
5. Data Access Layer (`lib/auth/dal.ts`, `server-only`): `getSession` (cached per request), `requireCustomer`, `requireVerifiedCustomer`, `requireOwner` (→ `notFound()`), structured so TOTP can be added to the owner later.
6. Turnstile: client widget on sign-up, server-side `siteverify` with Zod-validated response; test keys in dev.
7. Email: transport interface → Resend (prod) / Mailpit HTTP send API (dev/test); React Email templates (verification, magic link, reset) in both languages with light, dark-mode-safe styling.
8. Pages: `(auth)/sign-in`, `sign-up`, `forgot-password`, `reset-password`, `verify-email`; `admin/sign-in` (noindex, not linked); return-to-cart redirect handling via a validated `next` path (same-origin, locale-aware). Auth pages, account and admin live under a second, dynamic root layout `(secure)` so they have no prerendered shell (prepares the nonce routes of §17.5 §2); `proxy.ts` gives real 307/404 status codes optimistically.
9. Account & admin layouts verify the session on the server; admin returns 404 for non-owners.
10. Better Auth error codes → translated messages (`auth` namespace).
11. Owner seed (`prisma/seed.ts`) from env (`OWNER_USERNAME`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_FIRST_NAME`, `OWNER_LAST_NAME`) + default `StoreSetting`; idempotent.
12. `hooks.before` enforcement (§17.5 §7), matched against endpoint paths verified in the installed Better Auth 1.7 source: owner blocked from email/password and magic-link sign-in, non-owners blocked from username sign-in — both with the exact invalid-credentials error; password-reset requests always return the same generic response; `username` / `role` never settable by customers on any endpoint.
13. Offline owner recovery CLI `pnpm owner:reset-password` (sets a new password through Better Auth, revokes all owner sessions).

- **[T]** integration (one test per §17.5 §7 rule): guards, owner-only username sign-in, customer blocked from admin, owner blocked from email/magic-link sign-in with the generic error, unverified customer blocked, role/username not settable via sign-up/update/plugin endpoints, generic reset response, recovery CLI. E2E: sign-up → verify via Mailpit API → password sign-in → magic-link sign-in → password reset (other sessions revoked).
- **Exit:** every auth flow works locally; customers cannot reach anything under `/admin`.

## Phase 4 — Catalog → tag `phase-04-catalog`

1. `features/products` & `features/categories`: cached queries (`'use cache'`, `cacheTag('products' | 'product:{id}' | 'categories' | 'settings')`, `cacheLife`), select only needed fields.
2. Bilingual field fallback helper (`ar` empty → `en` and vice versa).
3. Home (featured, newest, categories), `/products` (search, category filter, sort, pagination; search params Zod-validated; static shell + dynamic results in `Suspense`), `/products/[slug]` and `/categories/[slug]` prerendered per locale with `generateStaticParams` + `ensureStatic`. `ensureStatic = "navigation"` forbids request-time data even inside `Suspense`, so personal header UI (account link, later the cart count) is resolved in the browser. E2E data is seeded before `next build`.
4. Shared components: `PriceDisplay` (USD primary, SAR beneath), `ProductCard`, empty states.
5. Product rich-text rendering through the allowlist sanitizer (render-side pass).
6. `next/image` with AVIF/WebP, `remotePatterns` for the public images bucket only; `priority` on the LCP image.
7. SEO: translated metadata, canonical, `hreflang` alternates + `x-default`, `sitemap.ts` (both locales, excludes admin/account), `robots.ts`.
8. Slug utility (emoji stripped, Arabic-safe), grapheme-length Zod helper (`Intl.Segmenter`).

- **[T]** unit: slugs, grapheme length, fallback, query param schemas. E2E: browse home → category → product in both locales.
- **Exit:** catalog fully browsable; static where intended (build output verified).

## Phase 5 — Owner Product Management → tag `phase-05-admin-products`

1. Admin shell: sidebar, theme/language switchers, `noindex`, 404 for non-owners.
2. Product list (shadcn Data Table, server-side pagination/sorting, status filter).
3. Product form: AR/EN tabs (title, short/long description, SEO), USD price, optional fixed SAR price, compare-at price, category, featured, status; Zod on client & server; grapheme limits.
4. Rich text editor lazy-loaded in admin only; output sanitized on write (and again on render).
5. Lightweight emoji picker, lazy-loaded on open.
6. Storage (`lib/storage`, §17.5 §8): S3 client (MinIO/R2); pre-signed PUT for owner uploads to a server-generated key under `pending/`; on confirm the server `HeadObject`s it, takes size and ETag/checksum from storage (never the client), enforces size/content-type limits, moves it to its final key and records metadata; images to the public bucket, product files to the private bucket; new versions mark the previous file `supersededAt` (never hard-deleted once downloaded).
7. Publish / archive (no hard delete for products with sales).
8. Categories: create, edit, reorder.
9. Exchange-rate setting.
10. Every mutation: `requireOwner` → Zod → transaction → `AuditLog` row (before/after diff) → `updateTag`.

- **[T]** integration: owner-only enforcement for every action, upload validation (bad MIME, oversize, spoofed key), audit rows. E2E: create → publish → visible in store immediately.
- **Exit:** a product published from the admin appears in the store immediately.

## Phase 6 — Cart, Checkout, and Payments → tag `phase-06-checkout`

1. `lib/money`: integer minor units, USD→SAR with round-half-up to the halala, fixed SAR override, coupons (percent/fixed, min subtotal, window, usage limit), optional store tax (never for Paddle, §17.5 §3) — all pure functions.
   1a. Coupon reservations (§17.5 §9): conditional `reservedCount` increment + `CouponRedemption(reserved)` at order creation; redeem in fulfilment; release on failure/expiry; a paid order is never rejected over coupon limits (overshoot recorded and flagged).
   1b. Zero-total orders (§17.5 §6): skip the gateway and fulfil in one transaction, under the same rate limits and ownership checks.
2. Cart: HMAC-SHA256 signed cookie (product IDs only, capped count), add/remove actions, prune owned items after sign-in.
3. Checkout gate (verified customer) with return-to-cart; checkout page (review, coupon, gateway choice limited to enabled gateways).
4. Server-side pricing + order creation (`pending`, item snapshots, exchange-rate snapshot) with per-account and per-IP rate limits.
5. `PaymentProvider` interface: `createPayment`, `verifyWebhook`, `fetchPayment`, `refund`; adapters: Moyasar (SAR, invoice/hosted page, shared webhook secret), Paddle (USD, transaction + Paddle.js checkout, `Paddle-Signature`), PayPal (USD, Orders v2, webhook signature verification API, capture); **fake** adapter that refuses to load when `NODE_ENV=production` (startup check).
6. `/api/webhooks/[provider]`: raw body → verify → `PaymentEvent` idempotency (unique `(provider, providerEventId)`) → re-fetch from provider → amount + currency match (Paddle: compare the line-item unit prices the store sent, independent of tax; tax mode set explicitly on every item and stored with `providerTaxMinor` / `chargedAmountMinor`, §17.5 §3) → fulfil in one transaction → respond fast.
7. `/checkout/result`: polls order status (never mutates it), redirects to My Purchases when paid.
8. Maintenance CLI `pnpm maintenance:run` (§17.5 §10), idempotent: expire stale `pending` orders and release their coupon reservations, delete expired verification tokens, delete unconfirmed `pending/` uploads older than 24 h. No public endpoint.

- **[T]** unit: money, coupons, tax, cart signing. Integration: each provider × (valid, duplicate, amount mismatch, currency mismatch, bad signature). E2E: checkout with the fake adapter. Documented sandbox runs via tunnel (`docs/SANDBOX_TESTING.md`).
- **Exit:** orders become `paid` only through verified webhooks.

## Phase 7 — Delivery → tag `phase-07-delivery`

1. Entitlements **upserted** on `(userId, productId)` inside the fulfilment transaction (`revokedAt = null`, new `orderItemId`; never a plain create, §17.5 §4); checkout still blocks buying a product the customer actively owns.
2. My Purchases page (`/account/library`): cover, title, purchase date, one download button per file, "Updated" badge.
3. `/api/downloads/[entitlementId]/[fileId]`: session → ownership → not revoked → file belongs to product → rate limit (`DownloadLog`, per account, `downloadsPerMinute`) → log row (hashed IP) → 302 to pre-signed GET (≤ 5 min, `attachment`, sanitized filename).
4. Receipt email after commit (order locale), resend capability; failures never affect fulfilment.
5. Zero-total orders: free products ("Get it") and 100 % coupons, fulfilled without a gateway (§17.5 §6).
6. Refunds (admin → provider API, or provider webhook) → `refunded` + entitlements revoked (rows kept); re-purchase afterwards succeeds.
7. Orders page (`/account/orders`) separate from My Purchases.

- **[T]** integration: ownership, revocation, rate limit boundary, free product, refund webhook. E2E: purchase → download → exceed limit → refund removes access.
- **Exit:** a complete test purchase through each gateway ends with a successful download.

## Phase 8 — Remaining Dashboard → tag `phase-08-dashboard`

Overview metrics; orders (filters, details, resend receipt, refund, grant/revoke entitlement); customers (list, purchases, ban); coupons (CRUD, deactivate, usage); all settings (bilingual store details, logos, support email, rate, tax, gateways, downloads per minute, legal content); audit log viewer. Account page: change email (re-verification), change password, delete account — one transaction deleting `User`, `Session`, `Account`, `Entitlement` (and cascading `DownloadLog`) while preserving `Order` / `OrderItem` (§17.5 §5); the owner can never be deleted through this flow.

- **[T]** integration + E2E for every owner action, including authorization failures for non-owners.

## Phase 9 — Quality and Security Hardening → tag `phase-09-hardening`

Two-policy CSP (§17.5 §2): per-request nonce + `'strict-dynamic'` on admin/account/checkout/auth routes (fully dynamic, only the third-party origins each route needs), static `next.config` policy without third-party script origins everywhere else; tests proving every script on protected routes carries the nonce and catalog routes still pass `ensureStatic`; SRI/hash-based CSP decision recorded (Turbopack support); plus HSTS, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; rate-limit review; full E2E matrix + axe; Lighthouse in both locales/themes; bundle analyzer; translated 404/error pages; legal placeholder pages; `pnpm audit`; `docs/SECURITY.md` (threat model, checklist, OWASP Top 10 mapping); coverage targets enforced (≥ 90 % critical modules, ≥ 70 % overall).

## Phase 10 — Release Preparation (no deployment) → tag `v1.0.0-rc.1`

Multi-stage non-root `Dockerfile`; production env template; health endpoint hardening; `docs/DEPLOYMENT.md` (VPS, Coolify/Dokploy, independent PostgreSQL 18 requirements, R2, Resend domain, `prisma migrate deploy`, backups, the daily `maintenance:run` schedule inside the app container); go-live checklist.

---

## Open questions

Section 17.5 of the specification (added 2026-10-18) resolved Q1 (account deletion → §5), Q2 (Paddle tax → §3) and Q4 (zero-total orders → §6). The remaining questions keep their proposed conservative defaults unless the owner decides otherwise.

| #   | Topic                                  | Needed before | Status / proposed default                                                                                                                                                              |
| --- | -------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Account deletion vs. financial records | Phase 3       | **Resolved by §17.5 §5.**                                                                                                                                                              |
| Q2  | Tax mode & Paddle                      | Phase 6       | **Resolved by §17.5 §3** (store tax never applied to Paddle orders). Open detail: store tax for Moyasar/PayPal is exclusive (added on top of subtotal − discount).                     |
| Q3  | Coupons with a fixed SAR price         | Phase 6       | SAR line price = fixed override ?? round-half-up(USD × rate); percent coupon applies to the SAR subtotal; fixed (USD) coupon is converted at the same rate and capped at the subtotal. |
| Q4  | Coupons that bring the total to 0      | Phase 6       | **Resolved by §17.5 §6.**                                                                                                                                                              |
| Q5  | Totals below a gateway minimum charge  | Phase 6       | Reject at checkout with a translated message; the customer can choose another gateway.                                                                                                 |
| Q6  | Refund granularity                     | Phase 7       | Full-order refunds only (partial refunds out of scope for v1).                                                                                                                         |
