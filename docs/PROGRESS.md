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
