-- Phase 6: the captured payment's id (for refunds) and the outcome of webhook processing.
ALTER TABLE "orders" ADD COLUMN "provider_payment_id" TEXT;
ALTER TABLE "payment_events" ADD COLUMN "outcome" TEXT;
