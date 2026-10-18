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
