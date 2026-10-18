# Master Prompt: Bilingual Digital Products Store

> This document is the complete and only specification for the project. Read all of it before writing any code. Where it conflicts with your own assumptions or habits, this document wins.

---

## 1. Your Role and Mission

You are a senior full-stack engineer and a security-minded technical lead.

Your mission is to build, from an empty directory, a production-grade, lightweight e-commerce store that sells **digital products only** (downloadable files):

- No shipping, no addresses, no physical inventory.
- Exactly **one store owner** who manages everything.
- Customers must have an account to buy, and download their purchases from their account.

Build incrementally, following the phases in **Section 15**. Each phase must end in a state that works, is tested, and is committed to Git before you start the next one.

---

## 2. Operating Rules

Follow these rules for the entire project.

1. **Read first, plan second, code third.**
   Read this entire document. Then create `docs/IMPLEMENTATION_PLAN.md` that breaks every phase down into concrete tasks, and commit it before writing application code.

2. **Handle ambiguity explicitly.**
   - If something is ambiguous, contradictory, or impossible **and it affects security, money, authentication, or the data model**, stop and ask before proceeding.
   - For minor gaps, choose the most conservative and secure option, record it in `docs/DECISIONS.md` (date, decision, reason, alternatives), and continue.

3. **Verify every library API against current official documentation.**
   Several libraries in this stack changed significantly in 2025–2026 (Next.js 16, React 19.3, Prisma 7, Better Auth 1.7, Tailwind CSS 4, shadcn/ui CLI v4). Do not rely on memory of older APIs. When in doubt, check the official docs or changelog.

4. **Minimize dependencies.**
   Do not add a package unless there is a clear need that the platform or the listed libraries cannot cover. Record every added dependency and its justification in `docs/DECISIONS.md`.

5. **Never hardcode secrets or user-facing text.**
   Secrets live in environment variables. All user-facing strings live in translation files.

6. **Never deploy, never use live keys, never spend money.**
   Use sandbox/test credentials only. Prepare deployment artifacts, but do not deploy.

7. **Keep a progress log.**
   Maintain `docs/PROGRESS.md`. After every phase, record: what was built, tests added, known limitations, and what comes next.

8. **Report at the end of every phase.**
   Summarize what was delivered, list the commits and the tag, explain how to run and verify it, and list any decisions that need the owner's approval.

---

## 3. Product Summary

- **Languages:** Arabic (default) and English, with full RTL / LTR layouts per language.
- **Themes:** light, dark, and system.
- **Purchasing:** customers must create an account to buy. After payment, products appear on their **My Purchases** page (Arabic label: «مشترياتي»), where they download the files.
- **Payments:** three gateways: **Moyasar**, **Paddle**, and **PayPal**.
- **Pricing:** prices are set in **USD**. The SAR price is derived from an exchange rate the owner can edit.
- **Emoji:** displayed next to text using the open-source **Twemoji** set, so it looks identical on every device.
- **Administration:** a single owner manages the store from an admin dashboard.

### 3.1 In Scope (Version 1)

- Catalog and categories, product pages, search and filtering.
- Cart and account-required checkout with three payment gateways.
- My Purchases page with secure, rate-limited file downloads.
- Customer account management.
- Coupons.
- Transactional emails (verification, magic link, password reset, receipt).
- Owner dashboard, settings, and audit log.
- Legal pages (terms, privacy, refund policy, about, contact).

### 3.2 Out of Scope (Do Not Build)

- Shipping, addresses, physical inventory.
- Guest checkout.
- Subscriptions or recurring billing.
- Multiple vendors or staff roles.
- Reviews and ratings.
- License keys or external-link delivery (files only in v1).
- Currencies other than USD and SAR.
- Mobile apps.

---

## 4. Technology Stack (Pinned)

| Area | Choice | Version | Must-know notes |
|---|---|---|---|
| Runtime | Node.js | Current LTS (22 or newer) | Next.js 16 requires Node.js ≥ 20.9. |
| Package manager | pnpm | Latest | Commit the lockfile. |
| Framework | Next.js, App Router | **16.4.x** (latest patch) | Turbopack is the default bundler. Enable **Cache Components**. Use **`proxy.ts`**, which replaces `middleware.ts` in Next.js 16. Enable the **React Compiler**. |
| UI runtime | React and React DOM | **19.3.x** | Ships with Next.js 16.4. |
| Styling | Tailwind CSS | **4.3.x** | CSS-first configuration via `@theme`. No `tailwind.config.js`. |
| Components | shadcn/ui (CLI v4) using **Base UI** primitives | Latest | Initialize with **RTL enabled** (`rtl: true` in `components.json`) so components install with logical classes. |
| Primitives | Base UI — package **`@base-ui/react`** | `^1` (verify the latest with `npm view`) | Never use the deprecated pre-1.0 package `@base-ui-components/react`. Use its direction provider. Popups use `inline-start` / `inline-end` sides so they flip with direction. |
| Database | PostgreSQL | **18.x** | Run in Docker locally. Use the native `uuidv7()` function for IDs. |
| ORM | Prisma ORM | **`~7.10.0`** (any 7.10.x patch) | **Warning:** installing `prisma` without a version now resolves to the **Prisma 8 release candidate**. Pin `prisma`, `@prisma/client`, and `@prisma/adapter-pg` to `~7.10.0`. Never allow 8.x. Use `prisma.config.ts`, the `prisma-client` generator with an explicit output directory (`generated/prisma`), and the PostgreSQL driver adapter with a connection pool. |
| Authentication | Better Auth | **1.7.x** | Prisma adapter; email and password; `username` plugin (owner only); `magicLink` plugin (customers); the Next.js cookies plugin so Server Actions can set cookies. |
| Internationalization | next-intl | Latest | Locale routing, messages, and Intl formatting. |
| Theming | next-themes | Latest | Class strategy, no flash on load. |
| Validation | Zod | **`^4.6.0`** | Zod 4 APIs only. At every input boundary. |
| Email | React Email + **Resend** | Latest | Use **Mailpit** to capture email in development. |
| File storage | S3-compatible SDK | Latest | **MinIO** locally, **Cloudflare R2** in production. |
| Emoji | **Twemoji** (maintained `jdecked/twemoji` fork) + a server-side parser | Latest | Graphics licensed CC-BY 4.0 (attribution required); code licensed MIT. |
| Bot protection | Cloudflare Turnstile | — | On the customer sign-up form, verified server-side. |
| Testing | Vitest, Playwright, axe-core | Latest | |
| Language | TypeScript | Latest, `strict` | |

---

## 5. Engineering Standards (Non-Negotiable)

### 5.1 Security

Use **OWASP ASVS Level 2** and the **OWASP Top 10** as the minimum baseline.

**Authorization and trust**

- **Authorize on the server, always.** All data access goes through a server-only Data Access Layer (modules importing `server-only`) that reads the session and checks the role before every sensitive read or write.
- **`proxy.ts` is optimistic only.** It handles locale negotiation and a cheap session-cookie presence check for redirects. It is never a security boundary. Real checks happen in layouts, pages, Server Actions, and route handlers.
- **Hidden UI is not security.** Every Server Action and route handler re-checks session, role, and ownership.
- **Never trust client-supplied prices, totals, currencies, discounts, or ownership.** Recompute everything from the database on the server.

**Input validation and output encoding**

- Validate every input with Zod: forms, Server Actions, route handlers, webhook payloads, search params, and cookies. Reject unknown keys.
- Rely on React's default escaping. Product rich text must be sanitized with an allowlist sanitizer on write and on render. Never inject unsanitized HTML into the DOM.
- Use Prisma's query API. If raw SQL is unavoidable, use parameterized tagged templates only. Never build SQL by string concatenation.

**Payment webhooks**

- Verify signatures against the **raw request body** using each provider's own mechanism.
- Enforce **idempotency** with a unique provider event ID per provider.
- **Re-fetch the payment from the provider's API** and match amount and currency against the order before fulfilling.
- Respond quickly and tolerate provider retries.
- The browser redirect after payment **never** changes order state.

**File delivery**

- Product files live in a **private** bucket. No public file URLs anywhere: not in pages, emails, or logs.
- The download route checks session, entitlement ownership, revocation, and rate limit, writes a log row, then redirects to a **pre-signed URL valid for at most 5 minutes**, served with `Content-Disposition: attachment`.
- Uploads are owner-only, via pre-signed PUT URLs. Validate MIME type and size on the server. Generate storage keys yourself; never derive them from user-supplied file names. Sanitize displayed file names.

**Authentication**

- Use Better Auth's built-in password hashing. Minimum password length: 8 characters.
- Enable the compromised-password check (available since Better Auth 1.7.3).
- Email verification is required before a customer can sign in.
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`. Configure trusted origins.
- Revoke other sessions after a password reset.

**Abuse prevention**

- **Rate limiting:**
  - Better Auth's limiter with stricter rules for customer sign-in, **owner sign-in**, magic-link requests, and password resets.
  - Order creation limited per account and per IP.
  - Downloads limited to **5 per minute per account** (configurable), computed from `DownloadLog` in PostgreSQL. Do not add Redis.
- **Bot protection:** Cloudflare Turnstile on customer sign-up, verified server-side.

**HTTP and browser security**

- A **Content Security Policy** following the two-policy strategy in **Section 17.5 §2**: per-request nonces on dynamic routes, and a static policy with no third-party script origins on prerendered routes.
- HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy`, and a restrictive `Permissions-Policy`.
- **CSRF:** rely on Server Actions' built-in origin checks and Better Auth's protections. No state-changing GET requests.

**Secrets, logging, and privacy**

- Secrets come only from environment variables, validated with Zod at startup (fail fast if anything is missing or malformed).
- No secret ever uses the `NEXT_PUBLIC_` prefix.
- Separate test and live keys for each gateway.
- Commit `.env.example` with placeholder values only.
- Never log secrets, tokens, passwords, or payment data. Store IP addresses only as hashes.
- Collect the minimum personal data needed. Support account deletion.
- Every owner mutation writes an `AuditLog` row (actor, action, entity, before/after diff).
- User-facing errors are generic and translated. Never expose stack traces or internals to clients.

**Dependencies and infrastructure**

- Keep dependencies minimal and actively maintained. Run `pnpm audit` in every phase.
- Keep Next.js and Better Auth on their latest patch releases; both ship security fixes regularly.
- **Least privilege:** the application's database user owns only its own schema. Never use a superuser in the connection string.

### 5.2 Code Quality and Best Practices

- TypeScript `strict` plus `noUncheckedIndexedAccess`. No `any`. No `@ts-ignore` or `@ts-expect-error` without a written reason.
- ESLint (Next.js and TypeScript rules) and Prettier. Zero warnings.
- **Server Components by default.** Use `"use client"` only for genuinely interactive leaves: the cart button, theme and language switchers, and forms.
- Feature-based project structure (Section 14). Business logic lives in pure, tested functions outside React components.
- **Money is always integer minor units** (cents for USD, halalas for SAR) together with an ISO currency code. Never use floating-point numbers for money. All money math lives in `lib/money`.
- No user-facing string literals in components. Everything goes through next-intl with type-safe keys.
- Accessibility: semantic HTML, full keyboard navigation, visible focus states, labelled controls, and WCAG 2.2 AA contrast in both themes.
- Shared types live in `types/index.ts`.
- Small, focused modules with descriptive names. Comments explain *why*, not *what*.

### 5.3 Testing

Tests are written **with each feature**, not saved for the end.

**Unit tests (Vitest)**

- Money math: USD → SAR conversion, rounding, coupons, optional tax.
- Price display formatting in both locales.
- Slug generation (emoji stripped).
- Grapheme-aware length validation.
- Entitlement and download rate-limit rules.
- Cart cookie signing and verification.
- Webhook signature verifiers for each gateway.

**Integration tests (Vitest + real PostgreSQL test database)**

- Server Actions and route handlers against the test database.
- Webhook handlers with signed fixtures for **each gateway**, covering: valid event, duplicate event, amount mismatch, currency mismatch, and invalid signature.
- Authorization: customers cannot invoke owner actions; users cannot download products they do not own; unverified customers cannot sign in.

**End-to-end tests (Playwright)**

- Customer: sign-up → email verification (read from Mailpit) → sign-in with password and with magic link → add to cart → checkout → product appears in My Purchases → download → exceed 5 downloads per minute → refund removes access.
- Owner: admin sign-in with username → create and publish a product → product appears in the store immediately.
- Run the critical flows in a **matrix**: Arabic / RTL and English / LTR, each in light and dark themes, with visual snapshots.

**Payments in automated tests**

- Implement a **fake payment provider adapter** behind the same interface for CI and automated E2E runs. It must be impossible to enable in production (guarded by environment checks that fail at startup).
- Document and run **real sandbox** checkouts for all three gateways locally through the webhook tunnel.

**Accessibility tests**

- axe checks on key pages in both directions and both themes.

**Coverage targets**

- ≥ 90% line coverage for `lib/money`, the auth guards and Data Access Layer, webhook handlers, and the download route.
- ≥ 70% overall.

**Rules**

- The test database is separate and reset before each run.
- Tests never call live services.

### 5.4 Git Workflow

- Initialize the repository **before** writing application code, with a complete `.gitignore` covering environment files (except `.env.example`), `node_modules`, `.next`, `generated/`, coverage output, Playwright artifacts, and Docker volumes.
- **Commit after every phase and after every significant feature within a phase.**
- Every commit must leave the project building, linted, type-checked, and with all tests passing.
- Use **Conventional Commits** with a scope. Examples:
  - `feat(auth): add owner username sign-in`
  - `test(webhooks): cover duplicate Paddle events`
  - `fix(i18n): force Latin digits for the Arabic locale`
  - `chore(deps): pin prisma to v7`
- Keep commits atomic and focused. Use the commit body to explain *why* when it is not obvious.
- At the end of every phase, create an **annotated tag**: `phase-01-setup`, `phase-02-foundation`, and so on.
- Install a lightweight pre-commit hook (for example, lefthook or simple-git-hooks) that runs lint, typecheck, and unit tests.
- Never commit secrets or real credentials. Never rewrite published history. Never force-push.

---

## 6. Users, Roles, and Authentication

### 6.1 Customer

- **Sign-up:** email and password only, protected by Turnstile. A verification email is sent, and sign-in is blocked until the email is verified.
- **Sign-in:** email and password, with a "remember me" option.
- **Magic Link:** an additional sign-in option. The customer enters an email and receives a single-use link with a short expiry. Account creation through magic links is **disabled**.
- **Password reset:** by email; all other sessions are revoked after the reset.
- **Account page:** change email (with re-verification) and password; delete account.
- Better Auth requires a `name` field. Derive it automatically from the local part of the customer's email. Customers have **no username**.
- An account with a verified email is **required** to check out.

### 6.2 Owner (Exactly One)

- **Fields:** username, first name, last name, password.
- Better Auth requires an email on every user. Store the owner's **real email for password recovery only**; it is never used to sign in. An offline recovery script on the server is also provided (Section 17.5 §7).
- **Sign-in:** at `/[locale]/admin/sign-in` with **username and password** (via the `username` plugin). This page is not linked from the storefront and must **reject any account whose role is not `owner`**.
- **Creation:** only through a seed script that reads the owner's credentials from environment variables. There is no UI to create an owner or promote a user.
- **Role field:** `customer` (default) or `owner`. It cannot be set through any sign-up or profile input.
- Apply stricter rate limits to owner sign-in, and structure the code so TOTP two-factor authentication can be added later.
- A customer session never grants admin access. Admin layouts return **404** to anyone who is not the owner.

### 6.3 Protection Layers

1. **`proxy.ts`:** locale negotiation and session-cookie presence redirects only.
2. **Data Access Layer:** session and role checks on every sensitive operation.
3. **Admin and account layouts:** server-side session verification.
4. **Every Server Action and route handler:** session, role, ownership, and Zod validation.

Enable Better Auth's session cookie cache to reduce database lookups.

---

## 7. Internationalization, Direction, Theming, and Emoji

### 7.1 Locales and Routing

- Locales: `ar` (default) and `en`. Every URL is prefixed (`/ar/...`, `/en/...`).
- `/` redirects to the preferred locale, using the locale cookie first, then `Accept-Language`.
- The locale layout sets `<html lang>` and `dir` (`ar` → `rtl`, `en` → `ltr`) **on the server**, so there is no flash and no layout shift.
- Translation messages are split by domain (`common`, `store`, `auth`, `account`, `admin`, `emails`) with type-safe keys, so a missing key fails type-checking.
- The language switcher keeps the user on the same page and stores the choice in a cookie.
- Bilingual content is stored as two columns per translatable field. If one language is empty, fall back to the other.
- Better Auth error codes are mapped to translated messages in both languages.

### 7.2 RTL / LTR Rules

- Use **Tailwind logical utilities only**: `ms-*` / `me-*`, `ps-*` / `pe-*`, `start-*` / `end-*`, `text-start` / `text-end`, `border-s` / `border-e`. Use `rtl:` and `ltr:` variants only for genuine exceptions. Add a lint rule or review checklist that catches physical direction classes.
- shadcn/ui is initialized with RTL; the Base UI direction provider receives its value from the locale.
- Flip directional icons (arrows, chevrons) in RTL. Never flip logos, media controls, or numbers.
- Isolate bidirectional fragments (emails, order numbers, usernames) so they do not scramble inside Arabic sentences.
- Email, password, and URL inputs are always LTR.

### 7.3 Fonts

- **IBM Plex Sans Arabic** (covers both Arabic and Latin) via `next/font`, self-hosted, subsets `arabic` and `latin`, `display: swap`.

### 7.4 Numbers, Dates, and Currency

- **Latin digits (123) in both languages, everywhere**: prices, dates, order numbers, dashboard counters.
- **Warning:** the `ar-SA` locale in `Intl` defaults to Arabic-Indic digits and the Islamic (Umm al-Qura) calendar. Configure formatting explicitly with Latin numbering and the Gregorian calendar (for example, the locale tag `ar-SA-u-nu-latn-ca-gregory`) in the shared next-intl format configuration.
- All formatting goes through `Intl` via next-intl, never manual string building.
- Prices show **USD as the primary price**, with the **SAR equivalent beneath it**, formatted for the current locale.

### 7.5 Theme

- next-themes with the class strategy. Options: light, dark, system (default: system). No flash on load.
- Bind Tailwind 4's `dark` variant to the `.dark` class.
- All colors are design tokens (oklch, following shadcn/ui conventions) defined for both themes. No hardcoded colors in components.
- Set `color-scheme` per theme so native controls and scrollbars match.
- Two logo variants (uploaded from settings) or an SVG logo that uses `currentColor`.
- A theme toggle in the storefront header and in the admin, with translated accessible labels.
- Emails use a light design with dark-mode-safe colors.

### 7.6 Emoji

- Render emoji in content (product titles, descriptions, category names, buttons) using **Twemoji**, so emoji look identical on every operating system and browser.
- **Do not rely on emoji fonts.** Safari does not support the COLRv1 color font format, so web emoji fonts such as Noto Color Emoji render inconsistently there.
- Replace emoji with **self-hosted Twemoji SVG images on the server** during rendering. Do not ship a client-side parsing script.
  - Each image's `alt` text is the original emoji, so copy/paste and screen readers work correctly.
  - Images are sized to the line height with correct vertical alignment, and lazy-load when off-screen.
- Do **not** transform emoji in `<title>`, meta tags, form inputs, or emails. Native emoji are used there.
- Add the Twemoji attribution (CC-BY 4.0) in the footer or on the About page.
- UI icons remain SVG icons (lucide). Emoji are for content only.
- **Data rules:**
  - The database uses UTF-8 encoding.
  - Zod length limits are counted in **graphemes** using `Intl.Segmenter`, not UTF-16 code units (composite emoji such as family emoji count as one).
  - Strip emoji when generating slugs.
- Test emoji at the start, middle, and end of Arabic and English sentences.
- The owner's product editor may include a lightweight emoji picker, lazy-loaded only when opened.

---

## 8. Routes

### 8.1 Storefront (under `/[locale]`)

| Path | Purpose | Rendering | Access |
|---|---|---|---|
| `/` | Redirect to the preferred locale | `proxy.ts` | Public |
| `/[locale]` | Home: featured products, newest products, categories | Static + cached | Public |
| `/[locale]/products` | All products with search, filters, pagination | Static shell + dynamic results | Public |
| `/[locale]/products/[slug]` | Product page | Prerendered per product and locale | Public |
| `/[locale]/categories/[slug]` | Products in a category | Static + cached | Public |
| `/[locale]/cart` | Cart | Dynamic (reads the cart cookie) | Public |
| `/[locale]/checkout` | Review order, apply coupon, choose gateway, redirect to payment | Dynamic | Signed-in, verified customer |
| `/[locale]/checkout/result` | Payment processing, then redirect to My Purchases | Dynamic | Signed-in |
| `/[locale]/account/library` | **My Purchases**: owned products with a download button per file | Dynamic | Signed-in |
| `/[locale]/account/orders` | Orders and receipts | Dynamic | Signed-in |
| `/[locale]/account` | Profile, change email or password, delete account | Dynamic | Signed-in |
| `/[locale]/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` | Customer authentication | Dynamic | Guests |
| `/[locale]/legal/[slug]` | Terms, privacy, refund policy, about, contact | Static | Public |

### 8.2 Admin (Owner Only, under `/[locale]/admin`)

| Path | Purpose |
|---|---|
| `/admin/sign-in` | Owner sign-in with username and password |
| `/admin` | Overview: sales today and last 30 days, order count, top products, recent orders |
| `/admin/products`, `/admin/products/new`, `/admin/products/[id]` | Product list, create, edit |
| `/admin/categories` | Categories and their order |
| `/admin/orders`, `/admin/orders/[id]` | Orders, order details, refunds |
| `/admin/customers`, `/admin/customers/[id]` | Customers and their purchases |
| `/admin/coupons` | Coupons |
| `/admin/settings` | Store settings, exchange rate, gateways, legal page content |
| `/admin/audit` | Owner audit log |

### 8.3 Server Endpoints (Outside the Locale Segment)

- `/api/auth/[...all]` — all Better Auth routes.
- `/api/webhooks/[provider]` — one endpoint per gateway (`moyasar`, `paddle`, `paypal`), each with its own verification.
- `/api/downloads/[entitlementId]/[fileId]` — the secure download gateway.
- `/sitemap.xml` and `/robots.txt` — both locales; exclude `/admin` and `/account` from indexing.

---

## 9. Data Model

**Global rules**

- **IDs:** PostgreSQL 18 native `uuidv7()` as the column default (time-ordered and index-friendly).
- **Money:** integer minor units plus an ISO currency code.
- **Bilingual fields:** a pair of columns per translatable field (`…Ar` / `…En`). Two fixed languages make this simpler and faster than a translations table.
- **Cart:** not stored in the database; it lives in a signed cookie.

| Entity | Purpose | Key fields |
|---|---|---|
| `User` | Customer or owner (managed by Better Auth) | email, emailVerified, name (derived for customers), role (`customer` / `owner`), preferredLocale, banned; owner-only optional fields: username (unique), firstName, lastName |
| `Session` / `Account` / `Verification` | Sessions, credentials, verification and magic-link tokens (managed by Better Auth) | Generated from the Better Auth configuration; never edit by hand |
| `Category` | Product grouping | slug (unique), nameAr, nameEn, sortOrder |
| `Product` | Digital product | slug (unique), titleAr/En, shortDescriptionAr/En, descriptionAr/En (sanitized rich text), **priceUsdCents**, fixedPriceSarHalalas (optional override), compareAtPriceUsdCents (optional), status (`draft` / `published` / `archived`), cover image, gallery, categoryId, featured, SEO title and description in both languages |
| `ProductFile` | File in the private bucket | productId, storageKey, fileName, sizeBytes and checksum (both read from storage, never from the client), mimeType, version, supersededAt (never hard-deleted once downloaded) |
| `Order` | A purchase | human-readable order number, userId (**nullable**, `onDelete: SetNull`), **customerEmailSnapshot**, status (`pending` / `paid` / `failed` / `refunded` / `expired`), subtotalUsdCents, discountUsdCents, taxUsdCents (optional, store tax — never for Paddle), totalUsdCents, chargedCurrency, chargedAmountMinor, providerTaxMinor and providerTaxMode (Paddle), exchangeRateUsed, couponId, locale, provider, providerReference, paidAt |
| `OrderItem` | Line item | orderId, productId, **snapshot** of titleAr/En and unit price at purchase time |
| `PaymentEvent` | Webhook log and idempotency guard | provider, providerEventId (unique per provider), type, payload (JSONB), processedAt |
| `Entitlement` | A customer's right to a product (powers My Purchases) | userId, productId, orderItemId, downloadCount (statistics only), revokedAt; **unique (userId, productId)**; written with **upsert**, never plain create (Section 17.5 §4) |
| `DownloadLog` | One row per download; source of the per-minute rate limit | entitlementId (`onDelete: Cascade`), fileId, createdAt, ipHash, userAgent |
| `Coupon` | Discounts | code (unique), type (`percent` / `fixed`), value, minSubtotalUsdCents, usageLimit, usedCount, reservedCount, allowMultiplePerCustomer (default false), startsAt, endsAt, active |
| `CouponRedemption` | Per-customer coupon tracking and reservations | couponId, userId (nullable, `onDelete: SetNull`), orderId, status (`reserved` / `redeemed` / `released`), expiresAt; partial unique index on (couponId, userId) for `reserved` and `redeemed` rows unless the coupon allows multiple uses per customer |
| `StoreSetting` | Singleton store settings | storeNameAr/En, logos (light/dark), supportEmail, **usdToSarRate (default 3.75)**, taxEnabled (default false), taxRate, vatNumber, enabled gateways, **downloadsPerMinute (default 5)**, legal page content in both languages |
| `AuditLog` | Owner actions | actorId, action, entity, entityId, diff (JSONB), createdAt |

**Design rules**

- **Snapshots:** orders store titles, prices, and the exchange rate at purchase time. Later edits to products or the exchange rate never change past orders.
- **No hard deletes for products with sales:** archive them so customers' purchases stay intact.
- **Indexes:** product (status, createdAt); product (categoryId); order (userId, createdAt); order (status); download log (entitlementId, createdAt).
- **Prisma client:** generated into `generated/prisma` (gitignored), connected through the PostgreSQL driver adapter with a connection pool.

---

## 10. Checkout, Payments, and Delivery

### 10.1 Order Flow

1. **Cart:** an HMAC-signed cookie containing product IDs only (quantity is always 1), with a capped size. Visitors can add items before signing in. After sign-in, remove items the customer already owns.
2. **Sign-in gate:** "Checkout" requires a signed-in customer with a verified email. After signing in or signing up, return the customer to the same cart.
3. **Checkout page:** review the order, apply a coupon, choose a gateway (Moyasar, Paddle, or PayPal).
4. **Server-side pricing:** recompute everything from the database in USD, apply the coupon, then convert to SAR (halalas) **only if Moyasar is selected**.
5. **Order creation:** create an `Order` with status `pending` and item snapshots, then create the payment with the provider, using the order ID as the reference (and as the idempotency key where supported).
6. **Payment:** the customer pays inside the provider's own UI. Card data never touches our servers.
7. **Return page:** shows "processing" and polls the order status, then redirects to My Purchases once the order is paid. It **never** marks an order as paid.
8. **Webhook:** verify signature → reject duplicates via `PaymentEvent` → re-fetch the payment from the provider API → match amount and currency to the order (for Paddle, match line-item prices as defined in Section 17.5 §3).
9. **Fulfilment, in one database transaction:** set the order to `paid`, upsert one `Entitlement` per item (Section 17.5 §4), convert the coupon reservation to `redeemed` (Section 17.5 §9), and record the `PaymentEvent`.
10. **After commit:** send a receipt email via Resend in the order's language, containing a link to My Purchases (no direct download links). Invalidate the relevant caches.

### 10.2 Payment Gateways

Implement a single `PaymentProvider` interface with four operations: **create payment**, **verify webhook**, **fetch payment**, and **refund**. Write one adapter per gateway. Adding or removing a gateway must not require changes to checkout logic.

| Gateway | Role | Charge currency | Webhook verification | Notes |
|---|---|---|---|---|
| **Moyasar** | Primary for customers in Saudi Arabia: mada, Visa, Mastercard, Amex, Apple Pay, STC Pay | **SAR** (converted from USD) | Shared webhook secret | Apple Pay requires domain registration. STC Pay does not work with test keys. |
| **Paddle** | International cards. Acts as Merchant of Record and handles tax for its sales | **USD** | `Paddle-Signature` header | Prefill the customer's email from the account. Tax mode and amount matching follow Section 17.5 §3. Paddle reviews the website (pricing, terms, refund policy) before going live. |
| **PayPal** | Customers who prefer paying with their PayPal account | **USD** (PayPal does not support SAR as a transaction currency) | PayPal's webhook signature verification API | Currency conversion fees may apply. |

### 10.3 Pricing Rules

- Each product's **base price is in USD cents**; this is charged directly through Paddle and PayPal.
- A single owner-editable **USD → SAR exchange rate** in settings (default **3.75**) produces the SAR amount that is displayed and charged through Moyasar.
- An optional **fixed SAR price** per product overrides the computed value.
- The storefront shows the **USD price with the SAR equivalent beneath it**.
- Define one explicit rounding rule (round half up to the nearest halala), implement it once in `lib/money`, and test it thoroughly.
- Tax is optional and **disabled by default**; if enabled, it is computed in `lib/money` and stored on the order.

### 10.4 My Purchases and Downloads

- My Purchases lists every product the customer owns: cover image, title, purchase date, and one download button per file. Show an "Updated" badge when a newer file version exists.
- The download button calls `/api/downloads/[entitlementId]/[fileId]`, which performs the checks in Section 5.1, writes a `DownloadLog` row, and redirects to a short-lived pre-signed URL.
- **Limit:** 5 downloads per minute per account (configurable in settings). No total download cap and no expiry date. When the limit is exceeded, show a translated "Please try again in a minute" message.
- When the owner uploads a new version of a file, all past buyers automatically get the new version.
- The orders and receipts page is separate from My Purchases.

### 10.5 Special Cases

- **Zero-total orders:** free products ("Get it") and orders reduced to zero by a 100% coupon skip the gateway and are fulfilled immediately on the server (Section 17.5 §6).
- **Refunds:** initiated from the admin via the provider API, or received through a provider refund webhook. The order becomes `refunded` and its entitlements are revoked, so the product disappears from My Purchases.
- **Stale pending orders:** the maintenance task marks pending orders older than a configured age as `expired` and releases their coupon reservations (Section 17.5 §10).
- **Receipt email failures** never affect fulfilment. The owner can resend receipts.

### 10.6 Files

- Version 1 delivers **files only**.
- Files live in a private bucket. The owner uploads directly from the browser using pre-signed PUT URLs; the server then verifies the object in storage and records its real metadata (Section 17.5 §8).
- Files are always served as attachments, never rendered inline.

---

## 11. Owner Dashboard

| Section | Capabilities |
|---|---|
| Overview | Sales today and in the last 30 days, order count, top products, recent orders |
| Products | List with status filter; form with Arabic/English tabs (title, descriptions, SEO); USD price; optional fixed SAR price; category; cover and gallery; file uploads; preview before publishing |
| Categories | Create, edit, reorder |
| Orders | Filter by status and date; order details; resend receipt; refund; grant or revoke an entitlement |
| Customers | Customer list; purchases per customer; ban an account |
| Coupons | Create, edit, deactivate; usage tracking |
| Settings | Bilingual store details, logos, support email, USD → SAR exchange rate, optional tax (off by default), enabled gateways, downloads per minute, legal page content |
| Audit log | Every owner change with timestamp and diff |

**Implementation rules**

- Server Components for reads. Server Actions for writes, each with an owner check, Zod validation, an audit log entry, and a cache-tag update.
- shadcn/ui Data Table with server-side pagination and sorting.
- A rich text editor, lazy-loaded inside the admin only; its output is sanitized.
- The admin is `noindex` and never linked from the storefront.

---

## 12. Performance

- **Targets (mobile, 75th percentile):** LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- **Cache Components** enabled. Catalog reads are cached with tags (`products`, `product:{id}`, `categories`, `settings`). Owner mutations call `updateTag` so changes appear immediately.
- Prerender product and category pages per locale. Use `ensureStatic` (new in Next.js 16.4) on them so the build fails if dynamic code leaks in.
- Stream personal UI (cart count, user menu) inside Suspense boundaries.
- Minimal client JavaScript. React Compiler enabled.
- `next/image` with AVIF/WebP and responsive sizes. Priority loading only for the LCP image. Public product images come from a CDN, separate from private files.
- Self-hosted, subset fonts.
- Database: indexes on filter columns, select only needed fields, paginate everything, avoid N+1 queries.
- Use the Next.js bundle analyzer, and run Lighthouse in both locales and both themes before release.

---

## 13. Environments

### 13.1 Development (Current Focus — Everything Runs Locally)

- **Docker Compose** with:
  - **PostgreSQL 18** with a named volume, a project-specific database and user, and UTF-8 encoding.
  - **Mailpit** to capture all outgoing email.
  - **MinIO** as the S3-compatible private bucket.
- `.env.local` with `DATABASE_URL` pointing to the Dockerized PostgreSQL on localhost.
- Sandbox keys for all three gateways. Receive webhooks locally through a secure tunnel (for example, Cloudflare Tunnel).
- A separate PostgreSQL database for automated tests.

### 13.2 Production (Prepare Only — Do Not Deploy)

- **Application:** Docker on a VPS (deployed via Coolify or Dokploy), HTTPS, a firewall allowing only web and SSH traffic, SSH key authentication only, and automatic security updates.
- **Database:** an **independent PostgreSQL 18** service, separate from the VPS. The provider will be chosen later. Requirements: same region as the VPS, TLS required, access restricted to the VPS IP, connection pooling, daily backups with point-in-time recovery, plus periodic off-site backups. Keep the configuration provider-agnostic (a standard `DATABASE_URL` with SSL).
- **Storage:** Cloudflare R2 private bucket for product files, plus a separate public bucket or CDN for product images.
- **Email:** Resend with a verified sending domain (SPF, DKIM, DMARC).
- **Migrations:** applied with Prisma's deploy command, never the development command.
- **Scheduled maintenance:** a daily CLI task run inside the app container, as defined in Section 17.5 §10.

---

## 14. Project Structure

Organize by feature (domain), not by file type.

```text
app/
  [locale]/
    (store)/        home, products, categories, cart, checkout, legal pages
    (auth)/         sign-in, sign-up, forgot/reset password, verify email
    account/        profile, library (My Purchases), orders
    admin/          sign-in and all dashboard sections
    layout          sets lang, dir, fonts, theme/intl/direction providers
  api/
    auth/           Better Auth handler
    webhooks/       one route per payment provider
    downloads/      secure download gateway
  sitemap, robots
features/
  products/ categories/ cart/ checkout/ orders/ downloads/ coupons/ customers/ settings/
    each with: queries (cached reads), actions (Server Actions), schemas (Zod), components
components/
  ui/               shadcn/ui components (added via CLI; modify only when necessary)
  layout/           header, footer, language and theme switchers, admin sidebar
  shared/           price display, product card, empty states, emoji text renderer
lib/
  auth/             Better Auth server config, client, session and role guards
  db/               single Prisma client instance with the PostgreSQL adapter
  storage/          uploads and pre-signed URLs
  payments/         PaymentProvider interface + Moyasar, Paddle, PayPal adapters (+ test-only fake)
  email/            sending via Resend
  env/              Zod-validated environment variables
  money/            minor-unit math, coupons, optional tax, USD→SAR conversion
  emoji/            server-side Twemoji transformation
  rate-limit/       PostgreSQL-backed limits
i18n/               routing and locale configuration
messages/           ar.json, en.json
emails/             bilingual React Email templates (verification, magic link, reset, receipt)
prisma/             schema, migrations, seed (owner + default settings)
generated/          generated Prisma client (gitignored)
types/              index.ts with shared types
tests/              unit/, integration/, e2e/
docs/               IMPLEMENTATION_PLAN, DECISIONS, PROGRESS, SECURITY, DEPLOYMENT
proxy.ts
prisma.config.ts
components.json     (RTL enabled)
docker-compose.yml  (PostgreSQL 18, Mailpit, MinIO)
.env.example
```

---

## 15. Implementation Phases

Complete the phases in order. Each phase lists its tasks, required tests, exit criteria, and commit points. **Do not start a phase until the previous one meets its exit criteria.**

### Phase 1 — Setup and Local Environment

**Tasks**
- Initialize Git with a complete `.gitignore`.
- Scaffold Next.js 16.4 (TypeScript strict, ESLint, Prettier, Turbopack, React Compiler, Cache Components).
- Configure Tailwind CSS 4.3.
- Initialize shadcn/ui with Base UI and RTL enabled.
- Add Docker Compose with PostgreSQL 18, Mailpit, and MinIO.
- Install `prisma`, `@prisma/client`, and `@prisma/adapter-pg` pinned to `~7.10.0` after verifying the versions with `npm view` (Section 17.5 §1), with `prisma.config.ts`, the PostgreSQL driver adapter, and the generator output in `generated/prisma`.
- Add Zod-validated environment configuration and `.env.example`.
- Set up Vitest and Playwright, plus the pre-commit hook.
- Write `README.md` with setup and run instructions.
- Create `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, and `docs/PROGRESS.md`.

**Exit criteria:** the app starts, a health check confirms the database connection, and lint, typecheck, and tests all pass.

**Commits (examples):** `chore: initialize repository` · `chore: scaffold next.js 16 app` · `chore(db): add docker compose and prisma 7` · `test: set up vitest and playwright`. **Tag:** `phase-01-setup`.

### Phase 2 — Visual Foundation

**Tasks**
- next-intl routing for `ar` and `en`, locale negotiation in `proxy.ts`.
- Server-side `lang` and `dir` on `<html>`.
- Shared Intl formats (Latin digits, Gregorian calendar).
- Fonts, theming (next-themes + design tokens), header and footer, language and theme switchers.
- Server-side Twemoji renderer and attribution.

**Tests:** unit tests for formatting and the emoji renderer; E2E smoke tests and visual snapshots across Arabic/RTL and English/LTR in light and dark; axe checks.

**Exit criteria:** base layout and components render correctly in all four combinations.

**Tag:** `phase-02-foundation`.

### Phase 3 — Database and Authentication

**Tasks**
- Full Prisma schema and initial migration (uuidv7 defaults, constraints, indexes).
- Better Auth: Prisma adapter; email and password with required verification; magic link with sign-up disabled; `username` plugin restricted to the owner; protected `role` field; rate limits; compromised-password check; Next.js cookies plugin.
- Better Auth `hooks.before` enforcement and the owner recovery CLI script (Section 17.5 §7).
- Turnstile on sign-up.
- Bilingual React Email templates: verification, magic link, password reset.
- Customer auth pages and the owner sign-in page.
- Owner seed script from environment variables.
- Data Access Layer, guards, and protection of the account and admin layouts.

**Tests:** integration tests for guards, owner-only sign-in, and blocking unverified customers; E2E for sign-up, verification via Mailpit, password and magic-link sign-in, and password reset.

**Exit criteria:** every authentication flow works locally, and customers cannot reach anything under `/admin`.

**Tag:** `phase-03-auth`.

### Phase 4 — Catalog

**Tasks**
- Home page, product listing (search, filters, pagination), product and category pages.
- Cached queries with tags; prerendering and `ensureStatic`.
- SEO: translated metadata, `hreflang` alternates with `x-default`, sitemap, robots.
- Optimized images.

**Tests:** unit tests for queries and slugs; E2E browsing in both locales.

**Exit criteria:** the catalog is fully browsable and static where intended.

**Tag:** `phase-04-catalog`.

### Phase 5 — Owner Product Management

**Tasks**
- Admin shell and navigation.
- Product CRUD with bilingual tabs, USD price, and optional fixed SAR price.
- Category management.
- Pre-signed uploads to a `pending/` prefix in MinIO with server-side `HeadObject` verification, file versioning with `supersededAt`, publish/archive (Section 17.5 §8).
- Cache invalidation with `updateTag`, audit logging, sanitized rich text.
- Exchange rate setting.

**Tests:** integration tests for owner-only actions, upload validation, and audit log entries; E2E: create → publish → visible in the store.

**Exit criteria:** a product published from the admin appears in the store immediately.

**Tag:** `phase-05-admin-products`.

### Phase 6 — Cart, Checkout, and Payments

**Tasks**
- Signed cart cookie.
- Checkout with the sign-in gate, coupons with reservations (Section 17.5 §9), and `lib/money` (USD → SAR conversion and rounding).
- Order creation and order-creation rate limiting.
- `PaymentProvider` interface with Moyasar, Paddle, and PayPal adapters (sandbox), plus the test-only fake adapter.
- Webhook routes with signature verification, idempotency, and amount/currency matching.
- Result page with polling; the maintenance CLI task that expires stale pending orders and releases their coupon reservations (Section 17.5 §10).

**Tests:** unit tests for money, coupons, and the cart; integration tests for each provider's webhooks (valid, duplicate, amount mismatch, currency mismatch, bad signature); E2E checkout with the fake adapter; documented sandbox runs for all three gateways through the tunnel.

**Exit criteria:** orders become `paid` only through verified webhooks.

**Tag:** `phase-06-checkout`.

### Phase 7 — Delivery

**Tasks**
- Entitlement upsert inside the fulfilment transaction (Section 17.5 §4).
- My Purchases page, download route with rate limiting, logging, and pre-signed URLs; "Updated" badge.
- Receipt email.
- Zero-total orders: free products and 100% coupons (Section 17.5 §6).
- Refunds that revoke entitlements, followed by successful re-purchase.

**Tests:** integration tests for ownership, rate limiting, and revocation; E2E: purchase → download → exceed the per-minute limit → refund removes access.

**Exit criteria:** a complete test purchase through each gateway ends with the product in My Purchases and a successful download.

**Tag:** `phase-07-delivery`.

### Phase 8 — Remaining Dashboard

**Tasks:** overview metrics; orders (resend receipt, refund, grant/revoke entitlement); customers (ban); coupons; all settings; audit log viewer; customer account deletion that preserves financial records (Section 17.5 §5).

**Tests:** integration and E2E tests for every owner action, including authorization failures for non-owners.

**Tag:** `phase-08-dashboard`.

### Phase 9 — Quality and Security Hardening

**Tasks**
- Security headers and the two-policy CSP (Section 17.5 §2), with its automated tests.
- Review of all rate limits.
- Full E2E matrix and accessibility audit.
- Performance audit (Lighthouse, bundle analyzer).
- Translated 404 and error pages.
- Legal pages with placeholder content for the owner to replace (terms, privacy, refund policy for digital goods).
- Dependency audit.
- `docs/SECURITY.md`: threat model, security checklist, and how each OWASP Top 10 risk is mitigated.

**Exit criteria:** all checks pass and documentation is complete.

**Tag:** `phase-09-hardening`.

### Phase 10 — Release Preparation (No Deployment)

**Tasks**
- Multi-stage `Dockerfile` running as a non-root user.
- Production environment template.
- Health check endpoint.
- `docs/DEPLOYMENT.md`: VPS setup, Coolify/Dokploy, requirements for the independent PostgreSQL 18 database, R2, Resend domain verification, Prisma deploy migrations, backups, and the maintenance task schedule (Section 17.5 §10).
- Go-live checklist: live gateway keys, Apple Pay domain registration with Moyasar, Paddle website review, DNS and email records.

**Tag:** `v1.0.0-rc.1`.

---

## 16. Definition of Done (Every Feature)

A feature is done only when **all** of the following are true:

- It meets this specification.
- It works in Arabic/RTL and English/LTR, in light and dark themes.
- It has no hardcoded user-facing strings.
- It enforces server-side authorization and Zod validation.
- Its tests are written and passing; lint and typecheck are clean.
- It introduces no new warnings and no secrets.
- `docs/PROGRESS.md` and, if applicable, `docs/DECISIONS.md` are updated.
- It is committed with a Conventional Commit message.

---

## 17. Known Open Items

- **Production database provider:** deferred. Keep the configuration provider-agnostic.
- **Live payment credentials:** provided later. Use sandbox keys now.
- **Legal page content:** use clearly marked placeholders; the owner will supply the final text.
- **Tax:** supported but disabled by default.

---

## 17.5 Critical Architectural Clarifications (Mandatory)

These rules **take precedence over every earlier section**. Where an earlier section is silent or could be read in more than one way, follow these rules exactly.

### §1. Package Names and Versions

- Use **`@base-ui/react`**, the stable package published since Base UI v1. Never use the deprecated pre-1.0 package `@base-ui-components/react`.
- Pin `prisma`, `@prisma/client`, and `@prisma/adapter-pg` to **`~7.10.0`** (any 7.10.x patch). Never allow 8.x, which is currently a release candidate published under the default tag.
- Use Zod 4 APIs with **`zod@^4.6.0`**.
- **Before writing any version range into `package.json`, confirm that the version exists** with `npm view <package> versions`. Never write a version you have not verified. The lockfile pins exact versions.

### §2. CSP Strategy: Nonces vs. Static Prerendering

**The constraint**

- Next.js applies nonces during server-side rendering from the request's CSP header, so **nonces require dynamic rendering**. Reading request headers to obtain a nonce makes a route dynamic and breaks `ensureStatic` on catalog routes.
- Nonces are also incompatible with prerendered static shells, which is the model Cache Components is built on.
- Hash-based CSP through Next.js's experimental SRI support is currently documented as webpack-only. Do not adopt it on Turbopack unless the current official documentation confirms support. Record the decision in `docs/DECISIONS.md`.

**Two policies**

1. **Nonce-protected routes** — `/[locale]/admin/*`, `/[locale]/account/*`, `/[locale]/checkout/*`, `/[locale]/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`:
   - A per-request nonce generated in `proxy.ts`.
   - `script-src 'self' 'nonce-…' 'strict-dynamic'`.
   - Only the third-party origins each route actually needs: payment gateway origins on checkout routes, Turnstile on sign-up.
   - These routes must render fully dynamically, with no prerendered shell.

2. **All other routes** (home, products, categories, cart, legal pages):
   - A static policy set through `next.config` headers, without nonces.
   - It allows Next.js's inline framework scripts (`script-src 'self' 'unsafe-inline'`) but **no third-party script origins**.
   - Plus `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, and `upgrade-insecure-requests`.
   - Never load third-party scripts on these routes.

**Consequences**

- On routes without nonces, the rich text sanitizer is the primary XSS defense. It must strip every script, event-handler attribute, and `javascript:` URL.
- Add automated tests that prove: (a) every script on nonce-protected routes carries the nonce under Cache Components, and (b) catalog routes still pass `ensureStatic`.

### §3. Paddle Tax and Webhook Matching

- Paddle is the Merchant of Record and assesses tax itself. **Never apply the store's internal tax to Paddle orders.**
- Set the **tax mode explicitly** on every Paddle transaction item the store creates, and record the mode on the order. Paddle's default for Saudi Arabia is tax-inclusive.
- **Webhook matching:** compare the **line-item unit prices the store sent** with the line-item prices in Paddle's transaction (both in USD), independent of tax.
  - Do **not** compare `totalUsdCents` with Paddle's pre-tax subtotal: in tax-inclusive mode the subtotal is lower than the store price, and genuinely paid orders would be rejected.
- Store on the order, separately from the store's own `totalUsdCents`: `providerTaxMode`, `providerTaxMinor` (tax collected by Paddle), and `chargedAmountMinor` (the amount actually charged).

### §4. Entitlement Re-Purchase After Refund

- Refunds set `revokedAt`. Entitlement rows are never deleted because of a refund.
- Fulfilment must **upsert** on `(userId, productId)`, setting `revokedAt` to null and updating `orderItemId`. Never use a plain create.
- Checkout still blocks buying a product the customer currently owns (an active, non-revoked entitlement).

### §5. Account Deletion vs. Financial Records

- `Order.userId` is **nullable** with `onDelete: SetNull`, and every order stores **`customerEmailSnapshot`** when it is created.
- When a customer deletes their account, delete in **one transaction**: `User`, `Session`, `Account`, `Entitlement`, and their `DownloadLog` rows (cascading from `Entitlement`). Preserve `Order` and `OrderItem` rows for accounting integrity.
- State the retention of order records, including the email snapshot, in the privacy policy placeholder.
- The owner account can never be deleted through the customer flow.

### §6. Zero-Total Orders (Free Products and 100% Coupons)

- If an order's final `totalUsdCents === 0`, skip payment gateway creation and fulfil the order immediately on the server in a **single transaction**: mark the order paid, upsert entitlements, and record the coupon redemption.
- Apply the same order-creation rate limits and the same ownership check, so free orders cannot be spammed or duplicated.

### §7. Better Auth Hook Enforcement

Implement these rules in a Better Auth `hooks.before` middleware.

**Match against the actual endpoint paths of the installed Better Auth version.** Verify them in the 1.7 documentation or source code before writing the hook. For example, password reset is exposed as `requestPasswordReset` in recent versions, and older `forget-password` names are deprecated. A hook that matches a path which does not exist silently enforces nothing, so **every rule below must be covered by an integration test**.

- **Owner and customer sign-in separation:**
  - Block email/password sign-in and magic-link sign-in for any user whose `role === "owner"`.
  - Block username sign-in for any user whose `role !== "owner"`.
  - In both cases, return exactly the same generic error as invalid credentials, so accounts cannot be enumerated.
- **Owner password recovery is allowed.** The owner's email exists specifically for recovery.
  - Password reset requests always return the same generic response, whether or not the account exists.
  - After resetting, the owner signs in at `/[locale]/admin/sign-in`.
- **Offline recovery:** provide a server-side CLI script (for example, `pnpm owner:reset-password`) that sets a new owner password through Better Auth's APIs and revokes all owner sessions.
- **Protected fields:** customers can never set or change `username` or `role` through any endpoint: sign-up, user update, or plugin endpoints.

### §8. File Versioning and Storage Verification

- Never hard-delete a `ProductFile` referenced by `DownloadLog`. Mark superseded versions with `supersededAt`. Buyers always receive the latest non-superseded version.
- Uploads go to a `pending/` prefix. When the owner confirms an upload, the server:
  1. Calls S3 `HeadObject` to verify the object exists.
  2. Reads the real size and ETag/checksum from storage; it never trusts client-submitted metadata.
  3. Enforces size and content-type limits based on those values.
  4. Moves the object to its final key and records the metadata.
- Unconfirmed objects under `pending/` are deleted after 24 hours by a bucket lifecycle rule or by the maintenance task.

### §9. Coupons: Concurrency and Per-Customer Limits

- **Reserve at order creation.** In one transaction:
  - Atomically increment `reservedCount` with a conditional update that succeeds only while `usedCount + reservedCount < usageLimit` (when a limit is set).
  - Create a `CouponRedemption` row with status `reserved` and an expiry equal to the pending order's lifetime.
  - The partial unique index on `CouponRedemption` blocks a second active redemption by the same customer unless `allowMultiplePerCustomer` is true.
- **Redeem at fulfilment:** move the reservation to `redeemed` (`usedCount + 1`, `reservedCount − 1`) inside the fulfilment transaction.
- **Release on failure or expiry:** set the redemption to `released` and decrement `reservedCount`.
- **A paid order is never rejected because of coupon limits.** If the reservation is missing or expired when payment arrives, fulfil the order anyway, record the overshoot, and flag it for the owner in the dashboard.

### §10. Scheduled Maintenance

- Implement maintenance as an **idempotent CLI script** (for example, `pnpm maintenance:run`) that:
  - expires stale pending orders and releases their coupon reservations,
  - deletes expired verification tokens,
  - deletes unconfirmed uploads under `pending/`.
- Run it daily as a **scheduled task inside the app container** through Coolify or Dokploy. No public endpoint is needed.
- Only if an external scheduler is unavoidable, expose `POST /api/internal/cron` authenticated with `Authorization: Bearer <CRON_SECRET>`:
  - the secret is at least 32 random bytes and compared in constant time,
  - POST only, rate-limited, idempotent, and excluded from the sitemap.
- Document the chosen approach in `docs/DEPLOYMENT.md`.

---

## 18. Your First Response

1. Confirm that you have read this entire document.
2. List any **blocking** questions (security, money, authentication, data model). If there are none, say so.
3. Create and commit `docs/IMPLEMENTATION_PLAN.md`.
4. Start Phase 1.