# Progress Log

## Phase 1 — Setup and Local Environment ✅ (tag `phase-01-setup`)

**Completed:** 2026-10-18

### Built

- Git repository on `main` with a complete `.gitignore` and LF-normalizing `.gitattributes`; the specification is committed under `context/`.
- Next.js 16.4.2 scaffold moved from `digital-products/` to the repository root and switched to **pnpm 11** (`pnpm-lock.yaml`, reviewed `allowBuilds`).
- `next.config.ts`: Cache Components, Partial Prefetching, React Compiler, typed routes, no `X-Powered-By`.
- TypeScript 6.0 `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`; ESLint 9 (Next core-web-vitals + TypeScript) with zero warnings; Prettier.
- Tailwind CSS 4.3 (CSS-first), shadcn/ui CLI v4 with **Base UI** and **`rtl: true`**, IBM Plex Sans Arabic.
- `docker-compose.yml`: PostgreSQL 18.6 (non-superuser app role owning app/shadow/test databases, UTF-8), Mailpit 1.31.6, MinIO (Chainguard build) with a private files bucket, a public media bucket and a least-privilege app user. Ports on `127.0.0.1` only.
- Prisma ORM 7.10.1 pinned to `^7`: `prisma.config.ts`, `prisma-client` generator → `generated/prisma`, pooled `PrismaPg` adapter in `lib/db`.
- Zod-validated environment (`lib/env`), checked at server start by `instrumentation.ts`; `.env.example` with placeholders only.
- `GET /api/health`: request-time database readiness probe (200 / 503, `no-store`).
- Vitest 5 (unit + integration projects, V8 coverage), Playwright 1.64 (Chromium, production build on port 3100), axe-core package, guarded automatic test-database reset.
- Pre-commit hook (simple-git-hooks): format check, lint, typecheck, unit tests.
- `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, this log.

### Tests

| Suite                                                  | Count | Covers                                                                                                                                                      |
| ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — `tests/unit/env/schema.test.ts`                 | 15    | Required/optional variables, defaults, URL protocols, production https/TLS rules, loopback exemption, no secret values in errors, no `NEXT_PUBLIC_` secrets |
| Unit — `tests/unit/db/health.test.ts`                  | 4     | Healthy, failing and hanging database; only the error class is logged                                                                                       |
| Integration — `tests/integration/health/route.test.ts` | 4     | Route against the real test DB, PostgreSQL 18 + `uuidv7()`, non-superuser role, test DB isolation                                                           |
| E2E — `tests/e2e/smoke.spec.ts`                        | 3     | Health endpoint, `<html lang="ar" dir="rtl">`, no `X-Powered-By`                                                                                            |

Coverage (Vitest, all projects): 93.6 % lines overall for the covered modules.

### Verification

```bash
pnpm services:up
pnpm check          # format, lint, typecheck, unit + integration tests
pnpm test:e2e       # production build + Playwright smoke tests
pnpm dev            # then: curl localhost:3000/api/health
```

### Known limitations

- `app/page.tsx` and `app/layout.tsx` are temporary placeholders; Phase 2 replaces them with the localized `app/[locale]` tree (and moves `lang`/`dir` there).
- The Prisma schema has no models yet (Phase 3).
- Mailpit and MinIO run, but the app does not send email or touch storage until Phases 3 and 5.
- `pnpm audit` reports one high-severity advisory in `braces` through dev tooling only, with no fix available (see DECISIONS); production dependencies are clean.
- Coverage thresholds are not enforced yet; they are added with the modules they target (`lib/money`, auth, webhooks, downloads) and enforced in Phase 9.

### Next — Phase 2 (Visual Foundation)

next-intl routing (`ar` default, `en`) and `proxy.ts`; server-side `lang`/`dir`; shared Intl formats with Latin digits and the Gregorian calendar; theming with next-themes and design tokens; header, footer, language and theme switchers; server-side Twemoji renderer; physical-direction lint guard; visual snapshots and axe checks in all four locale/theme combinations.

## Phase 2 — Visual Foundation ✅ (tag `phase-02-foundation`)

**Completed:** 2026-10-18

### Built

- **Specification update absorbed:** the owner's Section 17.5 is folded into the plan; Prisma packages pinned to `~7.10.0` and Zod to `^4.6.0` after `npm view` checks.
- **Locale routing:** next-intl with `ar` (default) and `en`, always prefixed. `proxy.ts` negotiates `/` (cookie → `Accept-Language` → Arabic) and keeps the choice in a one-year `NEXT_LOCALE` cookie. Structured to receive the Phase 9 CSP nonce step.
- **Root layout at `app/[locale]`:** `[locale]` is a root param, so `/ar` and `/en` are fully static (`○` in the build). `<html lang dir>` is rendered on the server; the reusable `RootDocument` carries the font, next-themes, Base UI `DirectionProvider` and a client provider that only ships the `common` messages.
- **Messages** split by domain (`common`, `store`, `auth`, `account`, `admin`, `emails`) for both languages, type-safe through `AppConfig` (missing keys fail `tsc`).
- **Shared formats** with Latin digits, Gregorian calendar and the Asia/Riyadh time zone; USD and SAR currency formats.
- **Theming:** light/dark/system with no flash, `dark` variant bound to `.dark`, `color-scheme` per theme, blue brand primary meeting WCAG AA in both themes.
- **Store shell:** skip link, sticky header (currentColor logo, language switcher that keeps path and query, keyboard-accessible theme menu), footer with copyright and the Twemoji CC-BY attribution; placeholder home hero.
- **Emoji:** server-only Twemoji rendering (`EmojiText`) with the vendored v17.0.3 SVG set and a checksum-verified sync script.
- **Direction guard:** local ESLint rule rejecting physical left/right Tailwind utilities (except behind `rtl:`/`ltr:`); `LtrText` helper for bidirectional fragments.

### Tests

| Suite                                                          | Count | Covers                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — `i18n/formats.test.ts`                                  | 14    | Latin digits for every named format in `ar`, `en`, `ar-SA`, `ar-EG`; Gregorian year; Riyadh time zone; USD/SAR display; ICU date arguments in messages; direction mapping                                 |
| Unit — `i18n/messages.test.ts`                                 | 6     | Key parity, non-empty messages, same arguments/tags per locale, balanced ICU, named formats only, no `#`                                                                                                  |
| Unit — `i18n/request.test.ts`                                  | 3     | Root-param locale, explicit locale, 404 for unsupported locales                                                                                                                                           |
| Unit — `emoji/*.test.ts(x)`                                    | 22    | Start/middle/end of Arabic and English sentences, ZWJ, flags, keycaps, skin tones, VS16, round-trip, asset existence for every parser output, no active SVG content, rendered `<img>` markup and escaping |
| Unit — `lint/no-physical-direction-classes.test.ts`            | 13    | Token detection, variants, arbitrary values, rtl/ltr exceptions, RuleTester valid/invalid cases                                                                                                           |
| Unit — `env/instrumentation.test.ts`, `i18n/ltr-text.test.tsx` | 5     | Boot-time env validation (and its build/edge skips), LTR isolation                                                                                                                                        |
| E2E — `foundation.spec.ts`                                     | 15    | ar/rtl × en/ltr × light × dark: attributes, theme, landmarks, Twemoji, visual snapshots, no console errors, axe WCAG 2.2 AA; `/` negotiation; language switcher; keyboard theme menu; skip link           |

Totals: **82 unit + 4 integration (Vitest), 18 E2E (Playwright)**. Coverage of covered modules: 98.7 % lines. Dev-mode check: no console errors or warnings in any locale/theme combination.

### Verification

```bash
pnpm services:up
pnpm check
pnpm test:e2e                      # add --update-snapshots after intentional visual changes
pnpm dev                           # http://localhost:3000 → /ar or /en
```

### Known limitations

- Unknown URLs show Next.js's default (untranslated) 404 until Phase 9.
- Store name comes from the message files until `StoreSetting` exists (Phase 3) and is editable (Phase 8).
- Pages are `noindex` until SEO lands in Phase 4.
- Visual baselines exist for Windows only (see DECISIONS).
- `pnpm audit`: unchanged dev-only `braces` advisory; production dependencies clean.

### Next — Phase 3 (Database and Authentication)

Full Prisma schema with the §17.5 fields and the initial migration; Better Auth (email/password with verification, magic link without sign-up, owner-only username sign-in, `hooks.before` enforcement verified against the installed 1.7 endpoints, rate limits, compromised-password check, Next.js cookies plugin); Turnstile on sign-up; bilingual React Email templates via Mailpit; customer and owner auth pages; owner seed and recovery CLI; Data Access Layer and protected layouts.

## Phase 3 — Database and Authentication ✅ (tag `phase-03-auth`)

**Completed:** 2026-10-21

### Built

- **Data model (spec §9 + §17.5):** every entity in one initial migration — users and Better Auth tables, categories, products, images, versioned files, orders and items with snapshots, payment events, entitlements, download logs, coupons and redemptions, settings, audit log and rate-limit buckets. `uuidv7()` IDs, integer money, `timestamptz`, snake_case. Migration SQL adds what Prisma cannot express: a single owner, usernames only on the owner, consistent order totals, non-negative money, coupon value ranges, one active single-use redemption per customer, one cover per product, order numbers from 100001, a singleton settings row.
- **Better Auth 1.7.12:** Prisma adapter with transactions; email + password with required verification, 8–128 characters, compromised-password check (Have I Been Pwned), sessions revoked on reset; magic links (10 min, single use, hashed, no sign-up); `username` plugin for the owner; protected `role`/`banned`/name fields; preferred language stored at sign-up; signed cookie cache; `nextCookies()`; unused endpoints disabled.
- **Policy hook (§17.5 §7)** verified against the installed endpoint paths: owner kept off email and magic-link sign-in with the exact invalid-credentials error, non-owners kept off username sign-in, sign-up field allow-list, protected fields on every update path, plus a session-creation backstop that also refuses banned accounts.
- **Rate limits:** stricter per-IP rules for customer sign-in, owner sign-in, magic links, password resets and sign-up, plus 10 attempts per 15 minutes per account. Stored in PostgreSQL under keyed hashes; session IPs are hashed too.
- **Turnstile** on sign-up, verified server-side by Better Auth's captcha plugin; site key read at request time.
- **Email:** bilingual React Email templates (verification, magic link, password reset; light, dark-mode-safe, RTL/LTR), Resend in production and Mailpit locally, sent after the response.
- **Pages:** sign-in (password + magic link, remember me), sign-up, forgot and reset password, verify email, owner sign-in at `/[locale]/admin/sign-in`, a placeholder account page and admin overview. Better Auth error codes map to translated messages; email, password and username inputs are always LTR.
- **Protection layers (§6.3):** `proxy.ts` (optimistic redirects and admin 404s), the Data Access Layer (`getSessionUser`, `requireCustomer`, `requireVerifiedCustomer`, `requireOwner`), server-checked account and admin layouts, and checks in every page. The admin answers 404 to everyone but the owner.
- **Two root layouts:** a static storefront root and a dynamic `(secure)` root for auth, account and admin; this prepares the nonce routes of §17.5 §2.
- **CLI:** `pnpm db:seed` (owner from `OWNER_*`, default settings; idempotent) and `pnpm owner:reset-password` (offline recovery, revokes owner sessions).
- **Test doubles:** `TEST_DOUBLES=on` (loopback `APP_URL` only) for Turnstile and Have I Been Pwned.

### Tests

| Suite                                        | Count | Covers                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration — `auth/policy.test.ts`          | 34    | Every §17.5 §7 rule through the real handler: sign-up allow-list, enumeration-safe answers, owner/customer separation, magic links, password reset (generic answer, owner recovery, session revocation, hashed tokens), protected fields, rate limits, hashed IPs, cookie flags |
| Integration — `auth/external-checks.test.ts` | 6     | The real Turnstile and Have I Been Pwned plugins against stubbed services (only a 5-character hash prefix leaves the server)                                                                                                                                                    |
| Integration — `auth/dal.test.ts`             | 11    | Guards with real sessions: guests, customers, unverified customers, banned and revoked sessions, owner-only access, safe return paths                                                                                                                                           |
| Integration — `auth/owner-account.test.ts`   | 6     | Idempotent seed, single owner, recovery revokes sessions, weak and breached passwords refused, settings defaults                                                                                                                                                                |
| Integration — `rate-limit`, `db/constraints` | 10    | Atomic limiter under concurrency, window reset; uuidv7 ordering, CHECKs, order numbers, orders kept on account deletion, coupon constraints                                                                                                                                     |
| Unit — auth, email, security, proxy, env     | 56    | Policy helpers, open-redirect guard, error-code mapping and translations, form checks, background tasks, keyed hashing, Resend/Mailpit payloads, email rendering in both languages, proxy rules, new environment rules                                                          |
| E2E — `auth.spec.ts`                         | 25    | Sign-up → Mailpit verification → sign-in → sign-out; unverified sign-in; magic link with return path; password reset; owner sign-in; admin 404 for guests and customers; axe and LTR inputs on auth pages in ar/en × light/dark; visual snapshots                               |

Totals: **138 unit + 71 integration (Vitest), 43 E2E (Playwright)**. Coverage: 97.1 % lines overall; `lib/auth/dal.ts` 100 %, `lib/auth` 95.9 %.

### Verification

```bash
pnpm services:up
pnpm db:migrate && pnpm db:seed
pnpm check
pnpm test:e2e
pnpm dev            # sign up at /ar/sign-up, read the email at http://127.0.0.1:8032
```

### Known limitations

- The account page is a placeholder; email change, password change and account deletion arrive in Phase 8 (Better Auth's own endpoints for these are disabled until then).
- A customer whose signed session cache has expired sees the admin's 404 page with HTTP status 200 (Next.js streaming); guests and customers with a fresh cache get a real 404.
- Verification links re-sent by a sign-in attempt lead to the home page rather than the "email confirmed" page.
- The Windows visual baselines of the home page predate the header's account link and must be regenerated on the development machine (see DECISIONS).
- `pnpm audit`: unchanged dev-only `braces` advisory; production dependencies clean.
- In the cloud environment used for this phase, MinIO's image registry (`cgr.dev`), Cloudflare and Have I Been Pwned were unreachable, so only PostgreSQL and Mailpit ran and the external checks were exercised through test doubles and stubs.

### Next — Phase 4 (Catalog)

Home page (featured, newest, categories), product listing with search, filters and pagination, product and category pages prerendered per locale with `ensureStatic`; cached queries with tags; bilingual fallback; slug and grapheme-length helpers; translated metadata, `hreflang`, sitemap and robots; optimized images.

## Phase 4 — Catalog ✅ (tag `phase-04-catalog`)

**Completed:** 2026-10-21

### Built

- **Pages:**
  - Home: hero, featured products, categories with counts, new arrivals.
  - `/products`: search, category filter, sort by newest or price, pagination. A plain GET form that works without JavaScript and navigates client-side with it.
  - Product pages: breadcrumbs, cover and gallery, USD price with SAR beneath, compare-at price, sanitized rich-text description, delivery note.
  - Category pages, and empty states for categories and searches.
- **Static where intended:** home, product and category pages use `ensureStatic = "navigation"` and are prerendered per locale. The build fails if request-time code leaks in (verified). `/products` has a static shell with streamed results.
- **Cached reads:** `features/{products,categories,settings}` with `'use cache'`, tags (`products`, `product:{id}`, `categories`, `settings`) and daily lifetimes, ready for `updateTag` in Phase 5. Only published products ever reach the storefront.
- **Money (`lib/money`):** exact USD→SAR conversion with round-half-up to the halala, fixed SAR override, decimal strings for structured data. Currency symbols are bidi-isolated, so Arabic shows "US$ 29.00" and "ر.س." correctly.
- **Text (`lib/text`):** Arabic-safe, emoji-free slugs; grapheme-based lengths; bilingual fallback (English pages show the Arabic text when English is empty, and vice versa).
- **Rich text (`lib/rich-text`):** allowlist sanitizer, applied again on render, with Twemoji for emoji in descriptions.
- **SEO:** translated titles and descriptions, canonical URLs, `hreflang` for `ar`, `en` and `x-default`, Open Graph, product JSON-LD, `/sitemap.xml` (both languages, alternates, nothing private), `/robots.txt`. Storefront pages are indexable; auth, account and admin are not.
- **Images:** `next/image` with AVIF/WebP, sizes and the public bucket as the only remote source; only the main product image is preloaded; placeholder when a product has no image.
- **Header:** primary navigation with a Products link. The account link is resolved in the browser so pages stay static.
- **Demo data:** `pnpm db:seed:demo` (local only) and a shared fixture for the tests.

### Tests

| Suite                                    | Count | Covers                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — `money`                           | 20    | Rate parsing, exact conversion and half-up rounding, fixed SAR override, decimal strings, currency isolation in Arabic and English                                                                                                                          |
| Unit — `text`                            | 20    | Slugs (English, Arabic, diacritics, tatweel, Arabic-Indic digits, emoji at start/middle/end, length), slug validation, grapheme counts, bilingual fallback                                                                                                  |
| Unit — `rich-text`                       | 14    | Allowed markup kept; scripts, handlers, dangerous URLs, images, SVG, styles removed; forced link attributes; escaped markup; Twemoji in descriptions without opening an injection path                                                                      |
| Unit — search params, SEO, public config | 16    | Defaults and fallbacks, canonical query strings, alternates and Open Graph, slug decoding, image URLs                                                                                                                                                       |
| Integration — `catalog/data.test.ts`     | 12    | Visibility (no drafts or archived), featured/newest order, detail with Arabic slugs, search in both languages, literal wildcards, category filter, price sorting, pagination, category counts, settings                                                     |
| E2E — `catalog.spec.ts`                  | 31    | Browsing in Arabic and English, fallback text, prices (fixed SAR, compare-at, free), 404 for drafts, search/filter/sort/pagination, sanitizer probe, canonical/hreflang/JSON-LD, sitemap, robots, axe and product snapshots in all four locale/theme combos |

Totals: **208 unit + 83 integration (Vitest), 74 E2E (Playwright)**. Coverage: 95.7 % lines overall; `lib/money`, `lib/text`, `lib/rich-text`, `lib/seo` and `lib/auth/dal` 100 %.

### Verification

```bash
pnpm services:up
pnpm db:migrate && pnpm db:seed && pnpm db:seed:demo
pnpm check
pnpm build          # catalog routes must stay ○ (static); a leak fails the build
pnpm test:e2e
pnpm dev            # http://localhost:3000/ar, /en/products, /ar/products/monthly-budget-planner
```

### Known limitations

- No add-to-cart yet: product pages say purchasing opens soon (Phase 6).
- Search has no Arabic normalization (hamza/alef forms, taa marbuta), see DECISIONS.
- Builds read the database to prerender the catalog; Phase 10 documents build access for production.
- No product images in the demo or test data: MinIO was not available in this environment, so image delivery is covered by configuration and URL tests only.
- Unknown URLs still show Next.js's default untranslated 404 (Phase 9).
- Windows visual baselines are outdated (header and home changed); Linux baselines are current.
- `pnpm audit --prod`: no vulnerabilities; the dev-only `braces` advisory is unchanged.

### Next — Phase 5 (Owner Product Management)

Admin shell and navigation; product CRUD with bilingual tabs, USD price and optional fixed SAR price; categories; pre-signed uploads to `pending/` with `HeadObject` verification and file versioning; publish/archive; `updateTag` invalidation, audit log and sanitized rich text on write; exchange-rate setting.

## Phase 5 — Owner Product Management ✅ (tag `phase-05-admin-products`)

**Completed:** 2026-10-21

### Built

- **Dashboard shell:** sidebar navigation (overview, products, categories, settings) that becomes a scrollable bar on small screens, current page marked with `aria-current`, "view store" link, language and theme switchers, sign-out. `noindex`; 404 for everyone but the owner (proxy, layout, every page and every action).
- **Products:**
  - List with search, status filter, sorting and pagination, all in the URL and validated with Zod (shadcn `Table`, server-rendered).
  - Form with Arabic/English tabs (title, short description, rich-text description, SEO title and description), live grapheme counters, USD price, optional fixed SAR and compare-at prices (Arabic-Indic digits accepted), slug (generated from the title when empty), category and "featured". Errors appear next to their fields and on the tab that has them; typed values survive a failed submission.
  - Lifecycle: publish (needs a file), archive, back to draft (unsold only), delete (unsold drafts only), preview with the exact storefront view, "view in store".
- **Uploads (§17.5 §8):** pre-signed PUT to `pending/` with signed Content-Type and Content-Length; signed upload tickets; server-side `HeadObject`, size/type limits, file signatures and real image dimensions; server-side copy to the final key (files private, images public with immutable caching); cover replacement, gallery of up to 8 images, image descriptions in both languages; file versions with `supersededAt`, history, and removal that keeps downloaded files. Progress is shown and announced.
- **Rich text:** Tiptap editor limited to the sanitizer's allowlist, loaded lazily in the admin only; sanitized again on write and on render. Lazy emoji picker (80 curated emoji drawn with the self-hosted Twemoji) for titles, short descriptions and the editor.
- **Categories:** create, rename (with slug), reorder (renumbered without gaps), delete when empty.
- **Settings:** USD → SAR exchange rate (normalized to six decimals); every SAR price on the store follows on the next request.
- **Every mutation:** `requireOwner()` (fresh session) → Zod (strict) → one transaction with an `AuditLog` row holding a before/after diff → `updateTag` for the affected catalog tags.
- **Shared code:** `lib/storage`, `lib/audit`, `lib/actions`, owner input parsing in `lib/money`, storefront paths in `lib/seo/paths.ts`, a product detail view shared by the store and the preview, and new shadcn-style primitives (table, tabs, badge, native select, textarea, popover, alert dialog).

### Tests

| Suite                                          | Count | Covers                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration — `admin/actions.test.ts`          | 13    | Every owner action refused for guests and customers with nothing written, revoked owner session refused at once, create/update with sanitized rich text and minimal audit diffs, validation keys, duplicate slugs, publish rules and immediate store visibility, sold products, deletion, categories, exchange rate, uploads through actions |
| Integration — `admin/uploads.test.ts`          | 12    | Against real MinIO: server-chosen keys and types, refused types and sizes, storage rejecting a body that differs from the signature, recorded size and MD5 from storage, disguised content, forged/tampered/expired/foreign-key tickets, versions, retiring downloaded files, image dimensions, cover replacement, gallery cap               |
| Integration — `admin/admin-data.test.ts`       | 6     | Owner list across statuses, filters, literal wildcards, sorting per language, pagination, edit and preview reads, category counts                                                                                                                                                                                                            |
| Unit — storage, tickets, audit, actions, money | 50    | Extension allowlist, size limits, every file signature, key generation, display-name sanitizing (paths, bidi controls, length), ticket signing and expiry, audit values and diffs, action error mapping, FormData parsing, amount and rate parsing with Arabic digits, form schemas, emoji files                                             |
| E2E — `admin.spec.ts`                          | 8     | Create → upload file and cover → publish → visible in the store with its optimized image and SAR price → archive → 404; disguised file refused; Arabic validation messages with values kept; categories added, reordered and shown in the store; guests get 404; axe on four dashboard pages in ar/en × light/dark                           |

Totals: **245 unit + 114 integration (Vitest), 82 E2E (Playwright)**. Coverage: 91.6 % lines overall.

### Verification

```bash
pnpm services:up
pnpm db:migrate && pnpm db:seed
pnpm check
pnpm test:e2e
pnpm dev            # sign in at /ar/admin/sign-in, then /ar/admin/products/new
```

### Known limitations

- The overview shows product counts only; sales metrics, orders, customers, coupons, the remaining settings and the audit-log viewer arrive in Phase 8 (audit rows are already written).
- Gallery images cannot be reordered yet, and image descriptions are set at upload time.
- Unconfirmed uploads under `pending/` are deleted by the maintenance task, which arrives in Phase 6.
- In this cloud environment MinIO ran from a stand-in image (`bitnamilegacy/minio`) because the project's Chainguard image registry was unreachable; the project's `docker/minio/init.sh` configured it.
- Windows visual baselines remain outdated (see Phase 4); Linux baselines are current.
- `pnpm audit --prod`: no known vulnerabilities.

### Next — Phase 6 (Cart, Checkout and Payments)

Signed cart cookie; checkout with the sign-in gate, coupons with reservations and server-side pricing; order creation with rate limits; the `PaymentProvider` interface with Moyasar, Paddle, PayPal and the test-only fake adapter; webhooks with signature verification, idempotency and amount/currency matching; the result page with polling; `pnpm maintenance:run`.

## Phase 6 — Cart, Checkout and Payments ✅ (tag `phase-06-checkout`)

**Completed:** 2026-10-21

### Built

- **Cart:** HMAC-signed cookie with product IDs only (max 20), "Add to cart" on product pages, a header count resolved in the browser (catalog pages stay static), and a cart page that streams its contents into a static shell.
- **Checkout** (`/[locale]/checkout`): signed-in, verified customers only (guests return to checkout after signing in); products already owned are left out; coupon field; choice among the gateways that are configured and enabled; every total recomputed on the server.
- **Pricing (`lib/money/order.ts`):** USD totals for the record, the charge in USD or SAR (fixed SAR prices respected, coupon applied to the SAR subtotal), discounts spread over lines exactly, optional store tax after the discount and never for Paddle, round half up everywhere.
- **Coupons (§17.5 §9):** validation (active, window, minimum, limit, one use per customer), conditional reservations in the order transaction, redemption at fulfilment, release on failure or expiry, overshoot flag instead of rejecting a paid order.
- **Orders:** item and exchange-rate snapshots, 10 per 10 minutes per account and 30 per IP, gateway minimums, the payment created after the order commits (the order fails and the coupon is released if the gateway is down). Zero-total orders (free products via "Get it free", 100 % coupons) skip the gateway and are fulfilled in the same transaction (§17.5 §6).
- **Gateways (`lib/payments`):** one `PaymentProvider` interface; Moyasar (SAR invoices, shared-secret webhooks), Paddle Billing (USD, explicit tax mode per item, `Paddle-Signature`, line-item matching, tax and charged amount recorded; Paddle.js page as the default payment link), PayPal Orders v2 (USD, verify-webhook-signature API with the raw event, capture on return or approval webhook), and a stateless, signed fake gateway for tests only. No SDKs.
- **Webhooks** (`/api/webhooks/[provider]`): raw body, signature verification, idempotency by provider event ID, re-fetch from the provider, order lock, currency/amount (or line-item) matching, then fulfilment (paid + entitlement upserts + coupon redemption), refund (revocation) or failure in one transaction. Every delivery's outcome is logged.
- **Result page:** polls the order (never changes it) and opens My Purchases when paid; a first My Purchases page lists owned products (downloads arrive in Phase 7).
- **Maintenance:** `pnpm maintenance:run` expires stale orders and releases reservations, deletes expired tokens, old rate-limit buckets and unconfirmed uploads.
- **Dashboard:** gateway toggles in the settings (only configured gateways can be enabled).
- **Docs:** `docs/SANDBOX_TESTING.md` for manual sandbox runs of all three gateways through a tunnel.

### Tests

| Suite                                     | Count | Covers                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration — `checkout/webhooks.test.ts` | 18    | Moyasar, Paddle, PayPal and the fake gateway × valid, duplicate, amount mismatch, currency mismatch, bad/missing/stale signatures; Paddle tax-inclusive line matching; PayPal raw-event verification and capture; refunds revoking access and re-purchase restoring it; retries after provider errors; late payments with coupon overshoot; concurrent deliveries processed once |
| Integration — `checkout/orders.test.ts`   | 11    | Snapshots, Moyasar SAR invoices with fixed prices, Paddle tax modes and no store tax, PayPal tax breakdown and idempotency key, zero-total orders, ownership, gateway availability and minimums, gateway outage, coupon rules, six concurrent checkouts on a two-use coupon, per-account and per-IP limits                                                                       |
| Integration — `checkout/routes.test.ts`   | 9     | Cart and checkout actions with a simulated request scope, the fake gateway end to end, the webhook route (401/404/413/500 and duplicates), the order status route, gateway settings                                                                                                                                                                                              |
| Integration — `maintenance/run.test.ts`   | 3     | Expiry and release (idempotent), token and bucket cleanup, unconfirmed uploads against MinIO                                                                                                                                                                                                                                                                                     |
| Unit — pricing, cart, gateways, client IP | 46    | Rounding, allocation, coupons, tax, USD/SAR pricing, cart cookie tampering and caps, adapter signatures and request shapes, error messages without bodies, IP resolution behind proxies, gateway environment rules                                                                                                                                                               |
| E2E — `checkout.spec.ts`                  | 9     | Add to cart → cart → coupon → fake payment → webhook → My Purchases; guests sent to sign in; free products; declined payments; status endpoint and forged webhooks; axe on cart and checkout in ar/en × light/dark                                                                                                                                                               |

Totals: **276 unit + 155 integration (Vitest), 91 E2E (Playwright)**. Coverage: 94.4 % lines overall; `lib/money` 100 %, webhook processing 93 %.

### Verification

```bash
pnpm services:up
pnpm db:migrate && pnpm db:seed
pnpm check
pnpm test:e2e
pnpm maintenance:run
```

### Known limitations

- The three gateways were exercised against stubbed APIs and the fake gateway only; the sandbox runs in `docs/SANDBOX_TESTING.md` still need credentials and network access to the providers.
- Downloads, receipt emails, the orders page and owner refunds arrive in Phases 7–8 (refund webhooks already revoke access).
- Paddle.js and the gateways' pages need CSP allowances on checkout routes; the CSP itself arrives in Phase 9.
- Visual baselines were refreshed for Linux (header cart link, purchase button); Windows baselines remain outdated.
- `pnpm audit --prod`: no known vulnerabilities.

### Next — Phase 7 (Delivery)

Downloads from My Purchases through `/api/downloads/[entitlementId]/[fileId]` (ownership, revocation, per-minute limit from `DownloadLog`, hashed IP, pre-signed attachment URLs of at most 5 minutes) with the "Updated" badge; receipt emails; the orders page; refunds end to end.

## Phase 7 — Delivery ✅ (tag `phase-07-delivery`)

**Completed:** 2026-10-21

### Built

- **My Purchases** (`/[locale]/account/library`): cover, title, purchase date and one download button per current file, with an "Updated" badge for versions published after the purchase and not yet downloaded; translated notices for the download limit and unavailable files.
- **Download gateway** (`/api/downloads/[entitlementId]/[fileId]`): fresh session, ownership, revocation, current file, per-minute limit computed from `DownloadLog` under a per-customer lock (configurable, default 5), hashed IP, then a 5-minute pre-signed attachment URL with the UTF-8 file name. Cross-site requests are not counted.
- **Fulfilment** (from Phase 6): entitlements upserted on (user, product) in the payment transaction, so refunds revoke (rows kept) and re-purchases restore the same row; zero-total orders fulfilled without a gateway.
- **Receipt emails** in the order's language after commit (webhooks and zero-total orders), with a link to My Purchases and no file links; failures never affect fulfilment.
- **Orders page** (`/[locale]/account/orders`) with status, items, discounts, tax, totals and the SAR amount; account section navigation.
- **Session reads** are no longer rate-limited (see DECISIONS).

### Tests

| Suite                                      | Count | Covers                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integration — `delivery/downloads.test.ts` | 8     | Logged downloads with hashed IPs, ownership, revocation, superseded versions, other products' files, archived products, the per-minute limit across products and its window, nine parallel clicks against a limit of five, the route's redirects (sign-in, cross-site, invalid IDs, limit), real MinIO attachment headers with an Arabic file name, the "Updated" badge rules, revoked products hidden |
| Integration — `delivery/receipts.test.ts`  | 4     | Receipts after webhook fulfilment and for zero-total orders through Mailpit, Arabic subject and RTL layout, discounts and totals, no download links or signed URLs, nothing for unpaid orders                                                                                                                                                                                                          |
| Unit — `delivery/disposition.test.ts`      | 2     | Attachment header with UTF-8 names and no header injection                                                                                                                                                                                                                                                                                                                                             |
| E2E — `delivery.spec.ts`                   | 6     | Purchase → download (file name and content) → five downloads → sixth refused with the translated message → receipt in Mailpit → refund webhook removes access (library, old link, orders page "Refunded") → buying again restores the same entitlement; guests and other customers cannot download; axe on My Purchases, orders and account pages in ar/en × light/dark                                |

Totals: **278 unit + 167 integration (Vitest), 97 E2E (Playwright)**. Coverage: 94.7 % lines overall.

### Verification

```bash
pnpm services:up
pnpm check
pnpm test:e2e
pnpm dev     # buy a product with a file, then /ar/account/library and /ar/account/orders
```

### Known limitations

- The exit criterion "a complete test purchase through each gateway" was met with the fake gateway end to end and with stubbed Moyasar, Paddle and PayPal APIs; the real sandbox runs (docs/SANDBOX_TESTING.md) still need credentials and network access to the providers.
- Owner-initiated refunds, resending receipts and granting/revoking access from the dashboard arrive in Phase 8 (refund webhooks already work end to end).
- Windows visual baselines remain outdated; Linux baselines are current.
- `pnpm audit --prod`: no known vulnerabilities.

### Next — Phase 8 (Remaining Dashboard)

Overview metrics; orders (filters, details, resend receipt, refund, grant/revoke access); customers (purchases, ban); coupons; all settings; the audit-log viewer; customer account deletion that keeps financial records.

## Phase 8 — Remaining Dashboard ✅ (tag `phase-08-dashboard`)

**Completed:** 2026-10-21

### Built

- **Overview** (`/admin`): sales today (Riyadh calendar day) and over the last 30 days in USD with paid-order counts, orders awaiting payment, top products, recent orders, and a warning linking to orders paid after their coupon reached its limit.
- **Orders** (`/admin/orders`, `/admin/orders/[id]`): filters by status, date range, coupon overshoot and order number or email; details with customer (or the email snapshot of a deleted account), gateway reference, coupon, rate, items with their access and download counts, totals and payment events. Actions: resend the receipt, refund through the gateway (Paddle reviews are recorded by its refund webhook), and grant or revoke an item's access.
- **Customers** (`/admin/customers`, `/admin/customers/[id]`): list with status filters and email search; a customer's products (from which order, or granted), orders and total paid; ban (every session ends at once) and lift the ban; grant a product or revoke access. The owner account is never listed or affected.
- **Coupons** (`/admin/coupons`, `new`, `[id]`): whole-percent or fixed USD discounts, minimum subtotal, total-use limit, per-customer rule and a Riyadh-time window; codes fixed once created; deactivate instead of delete; usage, held uses, discount given and redemptions.
- **Settings**: bilingual store name, support email, optional tax with VAT number, downloads per minute and the unpaid-order expiry; light and dark logos through the verified upload pipeline; the five legal pages in both languages, each saved on its own and sanitized. The storefront header, footer, titles and Open Graph site name use the owner's name and logos and stay static.
- **Audit log** (`/admin/audit`): every owner change with time, actor, translated action, a link to the record and the field-by-field diff; filters by section and record ID.
- **Account page** (`/[locale]/account`): change the email (confirmed from the new address), change the password (other devices signed out) and delete the account (user, sessions, credentials and access removed in one transaction; orders and items kept with the email snapshot). Each action checks the password with a per-account limit; the matching HTTP endpoints stay disabled.
- **Genuine 404s:** signed-in customers now get status 404 on every admin path (previously the 404 page with status 200; see DECISIONS).
- **Accessibility:** destructive controls meet 4.5:1 in the light theme; checkboxes are labelled in the server HTML.

### Tests

| Suite                                                     | Count | Covers                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integration — `admin/orders.test.ts`                      | 10    | Non-owner refusals; refunds (gateway, zero-total, unpaid, pending review, gateway refusal, missing gateway); revoke and grant per item without touching a re-purchase; resend receipt through Mailpit; filters; details; Riyadh-day sales  |
| Integration — `admin/customers.test.ts`                   | 6     | Non-owner refusals; the owner can never be banned or granted; ban ends sessions, unban, both audited; grant, duplicates, drafts, revoke, other customers' entitlements; list filters; details                                              |
| Integration — `admin/coupons.test.ts`                     | 4     | Non-owner refusals; create (any case), duplicate codes, edit with audited diff, deactivate; validation and unknown coupons; list and usage                                                                                                 |
| Integration — `admin/settings.test.ts`                    | 7     | Non-owner refusals for all six settings actions; details, tax and limits with audit and cache refresh; validation; legal pages one at a time, sanitized; logos verified, replaced and removed in MinIO; bad files; product tickets refused |
| Integration — `admin/audit.test.ts`                       | 1     | Newest first, owner's username, filters                                                                                                                                                                                                    |
| Integration — `account/settings.test.ts`                  | 6     | Guests redirected and the owner refused on all three actions; email change through the real confirmation link; existing addresses get nothing; password change signs out other devices; per-account limit; deletion keeps orders           |
| Integration — `auth/proxy-lookup.test.ts`                 | 1     | Only a live owner session passes the proxy's lookup                                                                                                                                                                                        |
| Unit — admin search, coupons, audit rows, settings, proxy | 20    | Filter parsing and Riyadh days; coupon form normalization and errors; coupon states; diff display; tax percent ↔ basis points; signed-token lookups and forged signatures in the proxy                                                     |
| E2E — `dashboard-admin.spec.ts`                           | 9     | Order access, receipt and refund with the customer's library following; ban/unban/grant; coupon lifecycle and audit log; store name and logo on the storefront; 404 for guests and customers; axe on nine pages in ar/en × light/dark      |
| E2E — `account.spec.ts`                                   | 7     | Email change via the link, password change and sign-in, account deletion; axe on the account page in ar/en × light/dark                                                                                                                    |

Totals: **295 unit + 202 integration (Vitest), 113 E2E (Playwright)**. Coverage: 94.2 % lines overall.

### Verification

```bash
pnpm services:up
pnpm check
pnpm test:e2e
pnpm dev     # sign in at /ar/admin/sign-in, then the overview, orders, customers, coupons, settings and audit log
```

### Known limitations

- Legal page content is stored and edited now; the public legal pages (`/[locale]/legal/[slug]`) with placeholder text arrive in Phase 9.
- Refunds were exercised with the fake gateway and stubbed providers; real sandbox refunds need provider credentials (docs/SANDBOX_TESTING.md).
- Pages that only read may show a banned customer's cached session for up to five minutes (signed cookie cache, spec §6.3); every mutation, checkout and download reads the session fresh.
- `pnpm audit --prod`: no known vulnerabilities.

### Next — Phase 9 (Quality and Security Hardening)

Security headers and the two-policy CSP (nonces for the dynamic routes, a static policy for prerendered pages) with tests; rate-limit review; translated 404 and error pages; legal pages with placeholders; full E2E and accessibility pass; Lighthouse and bundle analysis; dependency audit; `docs/SECURITY.md`.

## Phase 9 — Quality and Security Hardening ✅ (tag `phase-09-hardening`)

**Completed:** 2026-10-21

### Built

- **Two-policy CSP** (spec §17.5 §2): per-request nonces with `'strict-dynamic'` on admin, account, checkout and auth pages, with Paddle, Turnstile and the upload endpoint allowed only where needed; a static policy with no third-party origin on catalog, cart and legal pages. **Security headers** on every response: HSTS, nosniff, X-Frame-Options, Referrer-Policy, COOP, Permissions-Policy.
- **Proxy fixes:** request bodies stay intact when the nonce is added; the admin's 404 rewrite renders the store's 404 with the store's policy.
- **Translated 404 and error pages** for both root layouts, a catch-all for unknown paths with a real 404 status, and a bilingual global error page.
- **Legal pages** (`/[locale]/legal/terms|privacy|refund-policy|about|contact`): the owner's text or a marked placeholder, linked from the footer and listed in the sitemap; the privacy placeholder states order-record retention.
- **Rate-limit review:** coupon checks limited per account (the only gap found).
- **Performance:** fonts no longer preloaded and never swapped late; the dashboard's browser bundle no longer includes a Node crypto polyfill (−457 KB on the product and settings pages); heading order fixed on product lists.
- **`docs/SECURITY.md`:** threat model, checklist and OWASP Top 10 mapping.
- **Coverage floor** in Vitest.

### Audits

| Check                                  | Result                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse (mobile, simulated slow 4G) | Performance 90–97, accessibility 100, best practices 100, SEO 100 (cart 63: `noindex` by design); LCP 2.5–3.4 s simulated (0.3 s observed locally), CLS ≤ 0.07 |
| JavaScript on storefront pages         | 23–25 files, about 325 KB transferred; the rich-text editor stays in the dashboard's lazy chunk                                                                |
| axe (WCAG 2.2 AA)                      | Every storefront, account, checkout, dashboard, legal and 404 page in ar/en × light/dark                                                                       |
| `pnpm audit --prod`                    | No known vulnerabilities                                                                                                                                       |
| `pnpm audit` (with dev dependencies)   | One advisory in `braces` through ESLint's Next.js plugin and the shadcn CLI; no patched version; development only (SECURITY.md)                                |
| Framework versions                     | Next.js 16.4.2 and Better Auth 1.7.12 are the latest releases                                                                                                  |

### Tests

| Suite                                              | Count | Covers                                                                                                                                                 |
| -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit — `security/csp.test.ts`                      | 9     | Route classification and its next.config complement, both policies per route, third parties only where needed, dev and https switches, nonces, headers |
| Unit — `proxy/proxy.test.ts` (additions)           | 4     | One fresh nonce per request in the request and response, the static policy on the admin 404, none on catalog routes, POST bodies untouched             |
| Integration — `checkout/orders.test.ts` (addition) | 1     | Coupon checks per account                                                                                                                              |
| E2E — `security.spec.ts`                           | 5     | Every script nonced and no violations on auth, account, checkout and dashboard pages; static policy and no violations on catalog pages; headers        |
| E2E — `pages.spec.ts`                              | 6     | Legal pages from the footer, placeholders and retention statement; translated 404s with real statuses; axe on legal and 404 pages                      |

Totals: **308 unit + 203 integration (Vitest), 124 E2E (Playwright)**. Coverage: 93.9 % lines overall.

### Verification

```bash
pnpm services:up
pnpm check
pnpm test:e2e
pnpm build && pnpm start   # then: curl -sI localhost:3000/en | grep -i content-security
```

### Known limitations

- Paddle's and Turnstile's CSP origins follow their documentation; confirm them during the sandbox runs (docs/SANDBOX_TESTING.md).
- Windows visual baselines are outdated; Linux baselines are current.

### Next — Phase 10 (Release Preparation)

Multi-stage non-root Dockerfile, production environment template, health check, `docs/DEPLOYMENT.md` (VPS, Coolify/Dokploy, PostgreSQL 18, R2, Resend, migrations, backups, the maintenance schedule) and the go-live checklist.

## Phase 10 — Release Preparation ✅ (tag `v1.0.0`)

**Completed:** 2026-10-21. Nothing was deployed (spec rule).

### Built

- **`Dockerfile`** (multi-stage, non-root `node` user, read-only app, writable `.next` only, `HEALTHCHECK`), `.dockerignore`, and an optional extra-CA helper for builds behind TLS-inspecting proxies. The build receives the production environment as a BuildKit secret.
- **`.env.production.example`**: every production variable with placeholders and notes, tested against the production checks.
- **Health check:** `/api/health` (database readiness, 200/503) used by the image and the platform.
- **`docs/DEPLOYMENT.md`**: VPS hardening, Coolify/Dokploy setup, the independent PostgreSQL 18 database (TLS, IP allowlist, pooling, direct URL for migrations, build-time access), Cloudflare R2 (buckets, token scope, CORS for pre-signed PUT, custom domain), Resend (SPF, DKIM, DMARC), Turnstile, the first deployment, the daily maintenance task, backups and restore drills, operations, and the **go-live checklist** (live gateway keys and webhooks, Apple Pay domain registration with Moyasar, Paddle website review, DNS and email records, legal pages, test purchases and refunds).
- Migrations prefer `DIRECT_DATABASE_URL` when set; `prisma` and `tsx` are production dependencies so the container can run migrations, the seed and maintenance.
- Version `1.0.0`.

### Verification

| Check                     | Result                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Image build               | Builds with the environment as a secret; no secret in `docker history`                                         |
| Container                 | Runs as `node` (uid 1000), app files read-only, `.next` writable, Docker health `healthy`                      |
| Pages from the container  | `/api/health` 200, home, product and legal pages 200, `/en/admin` 404, unknown paths 404; CSP and HSTS present |
| Commands in the container | `prisma migrate status`: schema up to date; `pnpm maintenance:run`: JSON summary                               |
| Templates                 | Unit test: both templates name every variable; the production one passes the production checks                 |
| Full suites               | 311 unit + 203 integration (Vitest), 124 E2E (Playwright), `pnpm audit --prod` clean                           |

The local image was built on `node:24-bookworm`: this environment's network policy blocks `deb.debian.org`, which the slim image needs for OpenSSL. The default (slim) build installs it with apt as documented.

### Known limitations

- Real sandbox runs with each gateway (docs/SANDBOX_TESTING.md) and the live go-live checklist are left to the owner: they need provider accounts, credentials and a public domain.
- Windows visual baselines are outdated; Linux baselines are current.

### Release

`v1.0.0` is the first release: every phase of the plan is complete, documented and tested. The owner chose a final version over the release candidate the spec named (see DECISIONS.md).
