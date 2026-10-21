# Security

The baseline is OWASP ASVS Level 2 and the OWASP Top 10 (spec §5.1). This document is the threat model, the checklist the code is held to, and how each Top 10 risk is handled. Decisions behind individual measures are in [`DECISIONS.md`](DECISIONS.md); deployment hardening is in `DEPLOYMENT.md` (Phase 10).

To report a vulnerability, email the store's support address (Settings → Support email) rather than opening a public issue.

## Threat model

### What we protect

| Asset                                    | Where                                | Worst case                                       |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Paid product files                       | Private bucket (`S3_BUCKET_PRIVATE`) | Files downloaded without paying                  |
| Customer accounts (email, password hash) | PostgreSQL `users`, `accounts`       | Account takeover, personal data exposure         |
| The owner account                        | One `owner` row, username sign-in    | Full control of the store                        |
| Orders and payment references            | `orders`, `payment_events`           | Orders marked paid without payment; data leakage |
| Coupons                                  | `coupons`, `coupon_redemptions`      | Unlimited or guessed discounts                   |
| Secrets                                  | Environment variables only           | Forged sessions, webhooks or download URLs       |

### Actors and trust boundaries

- **Visitors and customers** reach the app only through the browser. Everything they send (forms, Server Action arguments, cookies, query strings, uploaded files) is untrusted and validated on the server.
- **The owner** is trusted for store content but still checked on every request: there is no admin API without a fresh owner session.
- **Payment providers** reach the app through webhooks. A webhook is believed only after its signature checks out and the payment is re-fetched from the provider's API.
- **Object storage** is reached by the browser only through short-lived pre-signed URLs the server issues; what the browser claims about an upload is re-checked against what storage holds.
- **`proxy.ts`** runs before rendering but is an optimistic layer (locale, redirects, genuine 404 statuses, CSP nonces). The security boundary is the Data Access Layer (`lib/auth/dal.ts`), every Server Action and every route handler.

### Main threats and mitigations

| Threat                                              | Mitigation                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Downloading without a purchase, or sharing a link   | Files live only in the private bucket. `/api/downloads/[entitlementId]/[fileId]` checks a fresh session, ownership, revocation and the per-minute limit, logs the download, then redirects to a pre-signed URL valid for 5 minutes (attachment). |
| Marking an order paid without paying                | Signature over the raw body, idempotency per provider event ID, re-fetch from the provider, amount and currency match under a row lock. The browser's return from the payment page never changes an order.                                       |
| Price, discount or currency tampering               | Prices, coupons, tax and the exchange rate are recomputed from the database at checkout; the browser sends product IDs only (from a signed cart cookie).                                                                                         |
| Coupon abuse                                        | Conditional reservation updates and a partial unique index (no overshoot under concurrency); per-customer rules; coupon checks limited to 30 per account per 10 minutes.                                                                         |
| Account takeover (credential stuffing, brute force) | Better Auth password hashing, minimum 8 characters, Have I Been Pwned check, per-IP and per-identifier sign-in limits, Turnstile on sign-up, email verification before sign-in, sessions revoked on password reset.                              |
| Owner account takeover                              | Separate username sign-in that refuses every customer, stricter limits, the owner email never signs in, offline recovery script; TOTP can be added in `requireOwner()`.                                                                          |
| Session theft used to change the account            | Email change, password change and deletion re-check the password with a per-account limit; the matching HTTP endpoints are disabled; a new email must be confirmed from the new address.                                                         |
| Stored XSS through product or legal text            | Allowlist sanitizer on write and again on render (no scripts, event handlers or `javascript:` URLs); React escaping everywhere else; CSP.                                                                                                        |
| Malicious uploads                                   | Owner only; type from an extension allowlist; size limits signed into the pre-signed URL; storage-side size, type and magic-byte checks and image dimension checks; server-generated keys; SVG refused.                                          |
| Clickjacking, MIME sniffing, referrer leaks         | `frame-ancestors 'none'` and `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, `no-referrer` on download redirects.                                                                                                         |
| CSRF                                                | Server Actions' origin check, Better Auth's origin check with trusted origins, `SameSite=Lax` cookies, no state-changing GET (downloads only append to their own log and are not counted when cross-site).                                       |
| Enumerating accounts or the admin                   | Sign-in and magic-link answers do not reveal whether an account exists; email change answers the same for taken addresses; every non-owner request to `/admin` gets a genuine 404.                                                               |
| Data exposure in logs                               | No secrets, tokens, passwords or payment data are logged; IP addresses are stored only as keyed hashes; errors shown to users are generic and translated, with a digest only.                                                                    |
| Denial of service through expensive endpoints       | Rate limits on every endpoint that signs in, sends email, creates orders, checks coupons or downloads (PostgreSQL-backed, no Redis).                                                                                                             |

## Security checklist (spec §5.1)

**Authorization and trust**

- [x] Every sensitive read or write goes through the server-only DAL (`requireOwner`, `requireCustomer`, `getSessionUser`), which reads the session fresh for owner access, mutations, checkout and downloads.
- [x] `proxy.ts` is never the only check; pages, Server Actions and route handlers re-check session, role and ownership.
- [x] Prices, totals, currencies, discounts and ownership are recomputed from the database.

**Input validation and output encoding**

- [x] Zod validates forms, Server Action arguments, route handlers, webhook payloads, search params and cookies; object schemas are strict.
- [x] Rich text is sanitized with an allowlist on write and on render. The only other `dangerouslySetInnerHTML` is the product JSON-LD block: serialized JSON with `<` escaped, in a non-executable `application/ld+json` script.
- [x] Prisma's query API everywhere; the few raw queries are parameterized tagged templates (row locks, advisory locks).

**Payment webhooks**

- [x] Signature verified against the raw body with each provider's mechanism; idempotent per provider event ID; payment re-fetched and matched; fast responses that tolerate retries; the browser redirect never changes order state.

**File delivery**

- [x] Private bucket, no public file URLs in pages, emails or logs; download checks, log row and pre-signed attachment URLs of at most 5 minutes.
- [x] Owner-only pre-signed uploads with server-side type and size validation and server-generated keys; displayed file names are sanitized.

**Authentication**

- [x] Better Auth hashing, 8-character minimum, compromised-password check, email verification before sign-in, other sessions revoked after a reset.
- [x] Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production; trusted origins come from `APP_URL`.

**Abuse prevention**

- [x] Stricter limits for customer sign-in, owner sign-in, magic links, resets, verification emails and sign-up; order creation per account and per IP; coupon checks per account; downloads per account per minute (configurable); password checks in account settings per account.
- [x] Turnstile on sign-up, verified on the server.

**HTTP and browser security**

- [x] Two-policy CSP (spec §17.5 §2): nonces with `'strict-dynamic'` on admin, account, checkout and auth pages; a static policy with no third-party origin on catalog pages. Tested in the real build (`tests/e2e/security.spec.ts`).
- [x] HSTS (two years, subdomains), `frame-ancestors 'none'`, `nosniff`, strict `Referrer-Policy`, restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`.

**Secrets, logging and privacy**

- [x] Secrets only from environment variables, validated with Zod at startup; none use `NEXT_PUBLIC_`; `.env.example` holds placeholders; test doubles are refused unless `APP_URL` is loopback.
- [x] Minimal personal data; account deletion removes the account and access and keeps orders with the email snapshot, as the privacy page states.
- [x] Every owner mutation writes an audit row with a before/after diff.

**Dependencies and infrastructure**

- [x] `pnpm audit --prod` is clean (Phase 9). Next.js and Better Auth are on their latest releases.
- [x] The application's database role owns only its own schema; it is not a superuser.

## OWASP Top 10 (2021)

| Risk                                       | How it is handled                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Broken Access Control**              | Deny by default: the DAL checks role and ownership on every read and write; admin layouts and every owner action call `requireOwner()` (fresh session); customer data is always filtered by the session's user ID; downloads check entitlement ownership; non-owners get 404s. Integration tests refuse every owner action for guests and customers. |
| **A02 Cryptographic Failures**             | TLS enforced in production (HSTS, `upgrade-insecure-requests`, https-only URLs validated at startup); Better Auth password hashing; HMAC-signed cart cookies, upload tickets and test webhooks with constant-time comparison; keyed hashes for IPs; tokens stored hashed.                                                                            |
| **A03 Injection**                          | Prisma's parameterized queries; Zod validation of every input; React escaping; allowlist sanitizer for rich text; strict CSP; RFC 6266 file names in `Content-Disposition` without header injection.                                                                                                                                                 |
| **A04 Insecure Design**                    | Prices recomputed on the server; webhook flow with idempotency, re-fetch and row locks; coupon reservations safe under concurrency; zero-total orders never touch a gateway; entitlements revoked on refund and restored on re-purchase; owner created only by the seed script.                                                                      |
| **A05 Security Misconfiguration**          | Environment validated at startup (test doubles refused off loopback, distinct buckets, https endpoints in production); security headers on every response; no `X-Powered-By`; admin and account pages `noindex`; generic error pages with digests only.                                                                                              |
| **A06 Vulnerable and Outdated Components** | Few, maintained dependencies, each recorded in DECISIONS; `pnpm audit` every phase; Next.js and Better Auth kept on their latest patches. The only finding is development-only (see below).                                                                                                                                                          |
| **A07 Identification and Authentication**  | Email verification, breached-password check, rate limits per IP and per identifier, single-use short-lived magic links that never create accounts, session revocation on reset and ban, password re-check for account changes, owner sign-in separated from customers.                                                                               |
| **A08 Software and Data Integrity**        | Webhook signatures over raw bodies; re-fetch before fulfilling; uploads verified by content, not by what the browser claims; signed upload tickets; lockfile-pinned dependencies with reviewed install scripts (`allowBuilds`).                                                                                                                      |
| **A09 Security Logging and Monitoring**    | Audit log of every owner change (viewer at `/admin/audit`); download logs; payment events with outcomes; server errors logged by class without personal data or secrets; error digests shown to users match server log lines.                                                                                                                        |
| **A10 Server-Side Request Forgery**        | The server calls only fixed provider APIs and the configured storage endpoint; no user-supplied URLs are fetched; the image optimizer accepts only the public bucket (`remotePatterns`), and local addresses only when that bucket itself is local.                                                                                                  |

## Accepted risks and limitations

- **Static CSP allows inline scripts** on prerendered catalog pages, because nonces need a fresh render per request (spec §17.5 §2). These pages load no third-party script, and the rich-text sanitizer is the main XSS defence there.
- **`style-src 'unsafe-inline'`** on all pages: style attributes (positioned popovers, the editor) cannot carry nonces. Styles cannot run script.
- **Cookie cache:** read-only pages may show a revoked or banned session for up to five minutes (spec §6.3). Mutations, checkout, downloads and the admin read the session fresh.
- **Client IPs** for per-IP limits come from `AUTH_IP_HEADERS` behind `AUTH_TRUSTED_PROXIES`; misconfigured, per-IP limits fall back to per-account limits only.
- **Third-party origins on checkout** (Paddle) and sign-up (Turnstile) follow the providers' documentation and must be confirmed in the sandbox runs (`SANDBOX_TESTING.md`).
- **HSTS without `preload`:** joining the preload list is a separate, hard-to-undo decision for the production domain.
- **No owner TOTP yet:** `requireOwner()` is the single place to add it.
- **Development-only advisory:** `braces` (GHSA-vfj7-8cjw-p6xm, no patched version) reaches the tree through ESLint's Next.js plugin and the shadcn CLI. Both only expand the project's own glob patterns during development and are not part of the built application.
