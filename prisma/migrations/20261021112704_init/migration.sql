-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('customer', 'owner');

-- CreateEnum
CREATE TYPE "locale" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "product_image_kind" AS ENUM ('cover', 'gallery');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'paid', 'failed', 'refunded', 'expired');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('USD', 'SAR');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('moyasar', 'paddle', 'paypal', 'fake');

-- CreateEnum
CREATE TYPE "provider_tax_mode" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "coupon_type" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "coupon_redemption_status" AS ENUM ('reserved', 'redeemed', 'released');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'customer',
    "preferred_locale" "locale" NOT NULL DEFAULT 'ar',
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL DEFAULT '',
    "title_en" TEXT NOT NULL DEFAULT '',
    "short_description_ar" TEXT NOT NULL DEFAULT '',
    "short_description_en" TEXT NOT NULL DEFAULT '',
    "description_ar" TEXT NOT NULL DEFAULT '',
    "description_en" TEXT NOT NULL DEFAULT '',
    "price_usd_cents" INTEGER NOT NULL,
    "fixed_price_sar_halalas" INTEGER,
    "compare_at_price_usd_cents" INTEGER,
    "status" "product_status" NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "category_id" UUID,
    "seo_title_ar" TEXT,
    "seo_title_en" TEXT,
    "seo_description_ar" TEXT,
    "seo_description_en" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "product_id" UUID NOT NULL,
    "kind" "product_image_kind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "alt_ar" TEXT NOT NULL DEFAULT '',
    "alt_en" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_files" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "product_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "superseded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_number" SERIAL NOT NULL,
    "user_id" UUID,
    "customer_email_snapshot" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending',
    "subtotal_usd_cents" INTEGER NOT NULL,
    "discount_usd_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_usd_cents" INTEGER NOT NULL DEFAULT 0,
    "total_usd_cents" INTEGER NOT NULL,
    "charged_currency" "currency" NOT NULL,
    "charged_amount_minor" INTEGER NOT NULL,
    "provider_tax_mode" "provider_tax_mode",
    "provider_tax_minor" INTEGER,
    "exchange_rate_used" DECIMAL(12,6) NOT NULL,
    "coupon_id" UUID,
    "coupon_overshoot" BOOLEAN NOT NULL DEFAULT false,
    "locale" "locale" NOT NULL,
    "provider" "payment_provider",
    "provider_reference" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "unit_price_usd_cents" INTEGER NOT NULL,
    "unit_charged_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "provider" "payment_provider" NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "order_id" UUID,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "order_item_id" UUID,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entitlement_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "type" "coupon_type" NOT NULL,
    "value" INTEGER NOT NULL,
    "min_subtotal_usd_cents" INTEGER,
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "allow_multiple_per_customer" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "coupon_id" UUID NOT NULL,
    "user_id" UUID,
    "order_id" UUID NOT NULL,
    "status" "coupon_redemption_status" NOT NULL DEFAULT 'reserved',
    "single_use" BOOLEAN NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "store_name_ar" TEXT NOT NULL DEFAULT '',
    "store_name_en" TEXT NOT NULL DEFAULT '',
    "logo_light_key" TEXT,
    "logo_dark_key" TEXT,
    "support_email" TEXT,
    "usd_to_sar_rate" DECIMAL(12,6) NOT NULL DEFAULT 3.75,
    "tax_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 0,
    "vat_number" TEXT,
    "moyasar_enabled" BOOLEAN NOT NULL DEFAULT false,
    "paddle_enabled" BOOLEAN NOT NULL DEFAULT false,
    "paypal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "downloads_per_minute" INTEGER NOT NULL DEFAULT 5,
    "pending_order_ttl_minutes" INTEGER NOT NULL DEFAULT 60,
    "terms_ar" TEXT NOT NULL DEFAULT '',
    "terms_en" TEXT NOT NULL DEFAULT '',
    "privacy_ar" TEXT NOT NULL DEFAULT '',
    "privacy_en" TEXT NOT NULL DEFAULT '',
    "refund_policy_ar" TEXT NOT NULL DEFAULT '',
    "refund_policy_en" TEXT NOT NULL DEFAULT '',
    "about_ar" TEXT NOT NULL DEFAULT '',
    "about_en" TEXT NOT NULL DEFAULT '',
    "contact_ar" TEXT NOT NULL DEFAULT '',
    "contact_en" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "diff" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "verifications_expires_at_idx" ON "verifications"("expires_at");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_started_at_idx" ON "rate_limit_buckets"("window_started_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_sort_order_idx" ON "categories"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_status_created_at_idx" ON "products"("status", "created_at");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_storage_key_key" ON "product_images"("storage_key");

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_files_storage_key_key" ON "product_files"("storage_key");

-- CreateIndex
CREATE INDEX "product_files_product_id_superseded_at_idx" ON "product_files"("product_id", "superseded_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_provider_provider_reference_key" ON "orders"("provider", "provider_reference");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "order_items"("order_id", "product_id");

-- CreateIndex
CREATE INDEX "payment_events_order_id_idx" ON "payment_events"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_provider_event_id_key" ON "payment_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "entitlements_product_id_idx" ON "entitlements"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_user_id_product_id_key" ON "entitlements"("user_id", "product_id");

-- CreateIndex
CREATE INDEX "download_logs_entitlement_id_created_at_idx" ON "download_logs"("entitlement_id", "created_at");

-- CreateIndex
CREATE INDEX "download_logs_file_id_idx" ON "download_logs"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_status_idx" ON "coupon_redemptions"("coupon_id", "status");

-- CreateIndex
CREATE INDEX "coupon_redemptions_status_expires_at_idx" ON "coupon_redemptions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "product_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Constraints Prisma's schema language cannot express (see comments in schema.prisma).
-- ─────────────────────────────────────────────────────────────────────────────

-- Users: exactly one owner, and only the owner has a username (spec §6.2).
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_owner_only" CHECK ("username" IS NULL OR "role" = 'owner');
CREATE UNIQUE INDEX "users_single_owner" ON "users" ((true)) WHERE "role" = 'owner';

-- Catalog: non-negative prices and a title in at least one language.
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_usd_cents_check" CHECK ("price_usd_cents" >= 0),
  ADD CONSTRAINT "products_fixed_price_sar_halalas_check"
    CHECK ("fixed_price_sar_halalas" IS NULL OR "fixed_price_sar_halalas" >= 0),
  ADD CONSTRAINT "products_compare_at_price_usd_cents_check"
    CHECK ("compare_at_price_usd_cents" IS NULL OR "compare_at_price_usd_cents" >= 0),
  ADD CONSTRAINT "products_title_present" CHECK ("title_ar" <> '' OR "title_en" <> '');
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_present" CHECK ("name_ar" <> '' OR "name_en" <> '');
CREATE UNIQUE INDEX "product_images_one_cover" ON "product_images" ("product_id") WHERE "kind" = 'cover';
ALTER TABLE "product_images"
  ADD CONSTRAINT "product_images_dimensions_check" CHECK ("width" > 0 AND "height" > 0);
ALTER TABLE "product_files"
  ADD CONSTRAINT "product_files_size_bytes_check" CHECK ("size_bytes" >= 0),
  ADD CONSTRAINT "product_files_version_check" CHECK ("version" >= 1);

-- Orders: human-readable numbers start at 100001; amounts are consistent.
ALTER SEQUENCE "orders_order_number_seq" RESTART WITH 100001;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative" CHECK (
    "subtotal_usd_cents" >= 0 AND "discount_usd_cents" >= 0 AND "tax_usd_cents" >= 0
    AND "total_usd_cents" >= 0 AND "charged_amount_minor" >= 0
    AND ("provider_tax_minor" IS NULL OR "provider_tax_minor" >= 0)
  ),
  ADD CONSTRAINT "orders_discount_within_subtotal" CHECK ("discount_usd_cents" <= "subtotal_usd_cents"),
  ADD CONSTRAINT "orders_total_consistent"
    CHECK ("total_usd_cents" = "subtotal_usd_cents" - "discount_usd_cents" + "tax_usd_cents"),
  ADD CONSTRAINT "orders_exchange_rate_positive" CHECK ("exchange_rate_used" > 0),
  ADD CONSTRAINT "orders_provider_for_paid_amounts" CHECK ("provider" IS NOT NULL OR "total_usd_cents" = 0);
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_prices_non_negative"
    CHECK ("unit_price_usd_cents" >= 0 AND "unit_charged_minor" >= 0);

-- Delivery.
ALTER TABLE "entitlements"
  ADD CONSTRAINT "entitlements_download_count_check" CHECK ("download_count" >= 0);

-- Coupons: valid values and counters; one active single-use redemption per customer.
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_value_check" CHECK (
    ("type" = 'percent' AND "value" BETWEEN 1 AND 100) OR ("type" = 'fixed' AND "value" > 0)
  ),
  ADD CONSTRAINT "coupons_counters_check" CHECK ("used_count" >= 0 AND "reserved_count" >= 0),
  ADD CONSTRAINT "coupons_usage_limit_check" CHECK ("usage_limit" IS NULL OR "usage_limit" > 0),
  ADD CONSTRAINT "coupons_min_subtotal_check"
    CHECK ("min_subtotal_usd_cents" IS NULL OR "min_subtotal_usd_cents" >= 0),
  ADD CONSTRAINT "coupons_window_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at"),
  ADD CONSTRAINT "coupons_code_upper_case" CHECK ("code" = upper("code") AND "code" <> '');
CREATE UNIQUE INDEX "coupon_redemptions_single_use_active"
  ON "coupon_redemptions" ("coupon_id", "user_id")
  WHERE "single_use" AND "status" IN ('reserved', 'redeemed');

-- Settings: a singleton row with sane values.
ALTER TABLE "store_settings"
  ADD CONSTRAINT "store_settings_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "store_settings_rate_positive" CHECK ("usd_to_sar_rate" > 0),
  ADD CONSTRAINT "store_settings_tax_rate_check" CHECK ("tax_rate_basis_points" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "store_settings_downloads_per_minute_check" CHECK ("downloads_per_minute" BETWEEN 1 AND 1000),
  ADD CONSTRAINT "store_settings_pending_ttl_check" CHECK ("pending_order_ttl_minutes" BETWEEN 5 AND 10080);

-- Rate limiting.
ALTER TABLE "rate_limit_buckets"
  ADD CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" >= 0);
