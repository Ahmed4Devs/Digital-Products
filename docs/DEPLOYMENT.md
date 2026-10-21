# Deployment

How to run the store in production (spec §13.2). Nothing here has been deployed by this project; it is the plan, tested as far as possible locally: the image builds, runs as a non-root user, passes its health check, serves the store, and runs migrations and the maintenance task.

## Overview

```text
                ┌──────────────────────────── VPS (Coolify or Dokploy) ───────────────────────────┐
 customers ──►  │  Traefik (HTTPS, Let's Encrypt) ──► app container (this image, port 3000)       │
   owner        │                                        │  daily: pnpm maintenance:run            │
                └────────────────────────────────────────┼─────────────────────────────────────────┘
                                                         │
     ┌──────────────────┬─────────────────────┬──────────┴─────────┬──────────────────────────┐
     ▼                  ▼                     ▼                    ▼                          ▼
 PostgreSQL 18     Cloudflare R2         Resend (email)     Moyasar / Paddle / PayPal     Cloudflare
 (managed, TLS,    private bucket +      verified domain    (webhooks to                  Turnstile
  IP allowlist)    public media bucket                      /api/webhooks/{provider})
```

- **One app container.** The cache that serves catalog pages lives in the container's memory and is invalidated there when the owner saves a change, so run a single replica. More replicas need a shared cache handler first.
- **Stateless container.** Files live in R2 and data in PostgreSQL; `.next/cache` (optimized images) is rebuilt as needed. Nothing needs a persistent volume.

## Requirements

| Component          | Version / note                                                      |
| ------------------ | ------------------------------------------------------------------- |
| VPS                | Ubuntu 24.04 LTS, 2 vCPU and 4 GB RAM or more (the build runs here) |
| Coolify or Dokploy | Current release, Docker with BuildKit                               |
| PostgreSQL         | 18, managed and independent of the VPS                              |
| Node.js            | 24 (in the image: `node:24-bookworm-slim`)                          |
| Object storage     | Cloudflare R2: two buckets and a custom domain for the public one   |
| Email              | Resend with a verified sending domain                               |

## 1. The VPS

1. Create the server in the same region as the database.
2. SSH keys only: in `/etc/ssh/sshd_config` set `PasswordAuthentication no` and `PermitRootLogin prohibit-password` (or `no` with a sudo user), then `systemctl reload ssh`.
3. Firewall: allow only SSH, HTTP and HTTPS.

   ```bash
   ufw default deny incoming && ufw default allow outgoing
   ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
   ufw enable
   ```

   Docker publishes ports past ufw; publish only through the platform's proxy (Traefik), never the app's port 3000 directly.

4. Automatic security updates: `apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.
5. Install Coolify or Dokploy with their official installer.

## 2. PostgreSQL 18

Choose a managed provider that offers: the same region as the VPS, TLS required, access restricted to the VPS IP, connection pooling, daily backups with point-in-time recovery, and PostgreSQL 18.

1. Create a database and a role that owns only that database (not a superuser):

   ```sql
   CREATE ROLE store_app LOGIN PASSWORD '…';
   CREATE DATABASE digital_products OWNER store_app ENCODING 'UTF8';
   ```

2. Allow connections from the VPS IP only.
3. `DATABASE_URL` ends with `?sslmode=verify-full` (or `require` / `verify-ca`); the server refuses to start without TLS. If the provider's CA is not publicly trusted, add it to the container with `NODE_EXTRA_CA_CERTS`.
4. **Pooling:** `DATABASE_POOL_MAX` is per container (default 10); keep it under the provider's limit. If `DATABASE_URL` is a transaction-mode pooler, also set `DIRECT_DATABASE_URL` to the direct endpoint: migrations take a session-level lock that such poolers break (`prisma.config.ts` prefers it).
5. **The build reads the database.** Catalog pages (home, products, categories, legal) are prerendered from it during `next build`, so the build (on the VPS) needs the same access as the app.

## 3. Cloudflare R2

1. Create two buckets, for example `store-files` (private: product files and uploads in progress) and `store-media` (public: product images and logos).
2. Connect a custom domain to `store-media` (for example `media.store.example.com`) and set it as `S3_PUBLIC_BASE_URL`. Never make `store-files` public.
3. Create an API token with **Object Read & Write** on those two buckets only; use its keys as `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, with `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com` and `S3_REGION=auto`.
4. **CORS on the private bucket**, so the owner's browser can upload to pre-signed URLs:

   ```json
   [
     {
       "AllowedOrigins": ["https://store.example.com"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Downloads need no CORS: they are top-level redirects to pre-signed URLs.

5. Optional: a lifecycle rule on `store-files` that deletes objects under `pending/` after 2 days (the maintenance task already does this).

## 4. Email (Resend)

1. Add the sending domain in Resend and create the DNS records it shows: SPF (TXT) and DKIM (CNAME/TXT) records, plus the return-path record.
2. Add DMARC: `_dmarc.store.example.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@store.example.com"`; move to `p=quarantine` once reports look clean.
3. Create an API key with sending access only (`RESEND_API_KEY`) and set `MAIL_FROM` to an address on the verified domain.

## 5. Cloudflare Turnstile

Create a widget for the store's domain (managed mode) and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Sign-up refuses requests without a valid token.

## 6. The application in Coolify or Dokploy

1. **Source:** this repository, branch of your choice; build pack **Dockerfile**.
2. **Environment:** every variable in [`.env.production.example`](../.env.production.example) as runtime variables. The server validates them at start and refuses unsafe values (http URLs, a database without TLS, test doubles).
3. **Build secret:** the build needs the same variables (prerendering reads the database; `APP_URL`, `S3_PUBLIC_BASE_URL` and `S3_ENDPOINT` are baked into the image allowlist and the CSP). They are passed as the BuildKit secret `build_env`, never as build arguments, so they stay out of the image:

   ```bash
   docker build --secret id=build_env,src=.env.production -t digital-products .
   ```

   In Coolify, enable **Use Docker Build Secrets** so variables reach the build as secrets; in Dokploy, build with the same command (or in CI) and deploy the image. Behind a TLS-inspecting proxy, also pass `--secret id=extra_ca,src=<ca bundle>`.

4. **Port** 3000; **domain** with HTTPS (Let's Encrypt); redirect HTTP to HTTPS.
5. **Health check:** path `/api/health` (the image also declares a Docker `HEALTHCHECK`). It answers 200 when the database is reachable and 503 otherwise.
6. **Pre-deployment command:** `pnpm db:deploy` (`prisma migrate deploy`). Never run `prisma migrate dev` in production.
7. **Trusted proxy:** set `AUTH_TRUSTED_PROXIES` to the platform proxy's network range (for Coolify: `docker network inspect coolify`), so rate limits see the real client IP.
8. **Scheduled task:** see [Scheduled maintenance](#8-scheduled-maintenance).

### What the image contains

- `node:24-bookworm-slim` plus OpenSSL (for Prisma's migration engine) and CA certificates.
- The built app and production dependencies, owned by root and read-only for the app; only `.next` is writable by the `node` user the container runs as.
- `pnpm` (pinned by `packageManager`), so the commands below run inside the container.

| Command (inside the container) | When                                               |
| ------------------------------ | -------------------------------------------------- |
| `pnpm db:deploy`               | Every deployment, before the new container starts  |
| `pnpm db:seed`                 | Once, to create the owner and the default settings |
| `pnpm maintenance:run`         | Daily (scheduled task)                             |
| `pnpm owner:reset-password`    | When the owner is locked out                       |

## 7. First deployment

1. Deploy once; the pre-deployment command applies the migrations.
2. Add `OWNER_USERNAME`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_FIRST_NAME` and `OWNER_LAST_NAME` to the environment and run `pnpm db:seed` in the container. Then **remove `OWNER_PASSWORD`** (and the other `OWNER_*` variables) from the environment.
3. Sign in at `https://store.example.com/ar/admin/sign-in` (the page is not linked anywhere).
4. In **Settings**: store name in both languages, logos, support email, the USD → SAR rate, tax if needed, the gateways to offer, and the five legal pages (the placeholders are only an outline).
5. Create categories and products, upload files and images, publish.
6. Run one real purchase per gateway for a small amount and refund it from the dashboard (see the go-live checklist).

**Updating:** pushing to the branch rebuilds the image and redeploys; migrations run first. Rebuild after changing `APP_URL`, `S3_PUBLIC_BASE_URL` or `S3_ENDPOINT` (they are baked into the build). Keep Next.js and Better Auth on their latest patch releases and run `pnpm audit --prod` before each release.

## 8. Scheduled maintenance

**Chosen approach:** a daily scheduled task inside the app container (spec §17.5 §10), so no public endpoint exists.

- Command: `pnpm maintenance:run`, daily at a quiet hour (for example `17 3 * * *`, Riyadh night).
- It expires pending orders older than the configured time and releases their coupon reservations, deletes expired verification tokens and rate-limit buckets, and deletes unconfirmed uploads under `pending/` older than a day.
- It is idempotent: running it twice, or after a missed day, is safe. It prints one JSON line with the counts; keep it in the platform's task logs.

## 9. Backups and recovery

- **Database:** the provider's daily backups with point-in-time recovery, plus a weekly off-site dump to a separate R2 bucket (or another provider), encrypted before upload. For example, a host cron job on the VPS:

  ```bash
  pg_dump --format=custom "$DIRECT_DATABASE_URL" \
    | age -r "$BACKUP_PUBLIC_KEY" \
    | rclone rcat "backups:store-db/$(date +%F).dump.age"
  ```

- **Files:** sync `store-files` and `store-media` to a second location weekly (`rclone sync`); R2 itself is redundant, but this protects against deletion by mistake.
- **Restore drill:** every quarter, restore the latest dump into a scratch database and run `pnpm db:deploy` against it; it should report no pending migrations.
- **Secrets:** keep `.env.production` in a password manager. Rotating `BETTER_AUTH_SECRET` signs every customer out and invalidates outstanding links.

## 10. Operations

- **Logs:** the platform keeps the container's stdout. The app logs errors by class and never secrets, tokens, passwords or payment data. Error pages show a digest that matches the server log line.
- **Uptime:** point an external monitor at `/api/health`.
- **Owner locked out:** `pnpm owner:reset-password` in the container sets a new password and signs the owner out everywhere.
- **Security reports:** see [`SECURITY.md`](SECURITY.md).

## Go-live checklist

**Infrastructure**

- [ ] VPS hardened: SSH keys only, firewall (22, 80, 443), unattended upgrades.
- [ ] PostgreSQL 18: TLS required (`sslmode=verify-full`), VPS IP only, non-superuser role, PITR on, off-site dump tested by a restore.
- [ ] R2: private bucket not public, public bucket on its custom domain, token scoped to both buckets, CORS for PUT from the store's origin.
- [ ] HTTPS on the store's domain; HTTP redirects to HTTPS. Consider HSTS preload only once the domain is permanent.
- [ ] `AUTH_TRUSTED_PROXIES` set to the platform proxy's range.
- [ ] Daily maintenance task scheduled and its first run checked.
- [ ] Uptime monitor on `/api/health`.

**DNS and email**

- [ ] A/AAAA records for the store and the media domain.
- [ ] Resend domain verified: SPF, DKIM, return path; DMARC published.
- [ ] A test sign-up confirmation email arrives in the inbox (not spam), in Arabic and English.

**Payments (live keys only on the live store)**

- [ ] Moyasar: live secret key; webhook to `/api/webhooks/moyasar` with `payment_paid`, `payment_failed`, `payment_refunded` and a new shared secret; **Apple Pay domain registered with Moyasar** (domain verification file served at the path Moyasar gives, then verified in its dashboard).
- [ ] Paddle: account and **website review approved** for the store's domain; live API key and client-side token; default payment link set to `https://store.example.com/ar/checkout/paddle` (the store sends customers to this page in their own language; Paddle uses the default for links it sends itself); notification destination to `/api/webhooks/paddle` with the events listed in `SANDBOX_TESTING.md`; `PADDLE_ENVIRONMENT=production`; tax mode and category confirmed with your accountant.
- [ ] PayPal: live REST app; webhook to `/api/webhooks/paypal` with the events listed in `SANDBOX_TESTING.md`; `PAYPAL_ENVIRONMENT=live`.
- [ ] Confirm the CSP allows Paddle's overlay on checkout pages in the live browser console (no violations).
- [ ] One real purchase per gateway for a small amount: the order becomes paid by webhook, the receipt arrives, the download works; then refund it from the dashboard and confirm access ends.

**Store**

- [ ] Owner seeded, `OWNER_*` variables removed, owner password long and unique.
- [ ] Store name, logos, support email, exchange rate, tax and gateways set in Settings.
- [ ] Legal pages written (terms, privacy including how long order records are kept, refund policy for digital goods, about, contact); no placeholder notice left.
- [ ] Turnstile production keys; a sign-up from a fresh browser succeeds.
- [ ] Demo catalog not loaded (`pnpm db:seed:demo` is for local use only).
- [ ] `pnpm audit --prod` clean; Next.js and Better Auth on their latest patch releases.
- [ ] Sitemap at `/sitemap.xml` lists the store's pages; Search Console verified (optional).
