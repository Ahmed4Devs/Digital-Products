# Sandbox Testing of the Payment Gateways

Automated tests never call a gateway: integration tests stub each provider's HTTP API, and the E2E suite pays through the test-only fake gateway (`TEST_DOUBLES=on`), which sends signed webhooks to the real webhook route. This document describes the **manual** sandbox runs that complete Phase 6's test plan, using each provider's sandbox and a public HTTPS tunnel to the local store. Use sandbox/test credentials only.

## 1. Expose the local store

Webhooks must reach your machine over HTTPS. Any tunnel works (for example `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`). Then, in `.env.local`:

```bash
APP_URL=https://<your-tunnel-host>     # every redirect and webhook URL is built from it
```

`TEST_DOUBLES` must be `off` (it is refused anyway for a non-loopback `APP_URL`), so Turnstile and the compromised-password check use their real (test) keys. Restart `pnpm dev` after changing the file.

Webhook endpoints:

| Gateway | URL                                     |
| ------- | --------------------------------------- |
| Moyasar | `https://<tunnel>/api/webhooks/moyasar` |
| Paddle  | `https://<tunnel>/api/webhooks/paddle`  |
| PayPal  | `https://<tunnel>/api/webhooks/paypal`  |

## 2. Moyasar (SAR)

1. In the Moyasar dashboard (test mode), copy the **test secret key** (`sk_test_…`) into `MOYASAR_SECRET_KEY`.
2. Under **Webhooks**, add the endpoint above with method POST, the events `payment_paid`, `payment_refunded` and `payment_failed`, and a **shared secret** of at least 16 random characters; put the same value in `MOYASAR_WEBHOOK_SECRET`.
3. Enable Moyasar in `/ar/admin/settings`.
4. Buy a product choosing "Card or Apple Pay (Moyasar)". The store creates an invoice and sends you to Moyasar's hosted page. Pay with a Moyasar test card (see Moyasar's testing guide). STC Pay does not work with test keys; Apple Pay needs the domain registered with Moyasar (go-live checklist).
5. Expected: the result page shows "processing", the webhook arrives, the store re-fetches the payment with the secret key, matches the SAR amount and currency, and the order becomes **paid**; the product appears in My Purchases.
6. Check the event log: `payment_events` has one row with `outcome = fulfilled`. Re-deliver the webhook from the dashboard: the new delivery is answered `200` with `outcome: duplicate`.
7. Refund from the Moyasar dashboard: the `payment_refunded` webhook marks the order **refunded** and revokes access.

## 3. Paddle (USD, Merchant of Record)

1. In the Paddle **sandbox** dashboard: create an API key (`PADDLE_API_KEY`) and a client-side token (`PADDLE_CLIENT_TOKEN`); keep `PADDLE_ENVIRONMENT=sandbox`.
2. Set the **default payment link** (Checkout settings) to `https://<tunnel>/ar/checkout/paddle` (or `/en/…`). Paddle appends `?_ptxn=…`; that page opens Paddle's overlay checkout with the customer's email prefilled.
3. Under **Notifications**, create a destination for the webhook URL with the events `transaction.paid`, `transaction.completed`, `transaction.canceled`, `transaction.payment_failed`, `adjustment.created` and `adjustment.updated`. Copy its secret key into `PADDLE_WEBHOOK_SECRET`.
4. Choose the tax mode: `PADDLE_TAX_MODE=internal` (default: the displayed price includes tax) or `external` (Paddle adds tax). Every transaction item carries the mode explicitly and the order records it (spec §17.5 §3).
5. Enable Paddle in the admin settings and buy a product with Paddle's sandbox test card.
6. Expected: the order becomes **paid** after `transaction.completed`; `providerTaxMode`, `providerTaxMinor` (tax Paddle collected) and `chargedAmountMinor` (grand total) are stored; the store's own tax is never applied. Matching compares the line-item unit prices the store sent, so tax-inclusive transactions are not rejected.
7. Refund from the Paddle dashboard: once the adjustment is approved, `adjustment.updated` marks the order refunded.

## 4. PayPal (USD)

1. In the PayPal Developer Dashboard (sandbox), create a REST app: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox`.
2. Add a webhook for the app with the URL above and the events `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.CAPTURE.REVERSED`. Put its **Webhook ID** in `PAYPAL_WEBHOOK_ID`.
3. Enable PayPal in the admin settings and pay with a sandbox **personal** account.
4. Expected: after approval PayPal returns the customer to the result page, which asks the store to capture the order (the `CHECKOUT.ORDER.APPROVED` webhook does the same if the customer closes the tab). `PAYMENT.CAPTURE.COMPLETED` is verified through PayPal's verify-webhook-signature API with the raw body, the order is re-fetched and matched, and it becomes **paid**.
5. Refund the capture in the sandbox: `PAYMENT.CAPTURE.REFUNDED` marks the order refunded.

## 5. Checks for every gateway

- Tamper with a webhook (for example resend it with a changed body through a tool such as `curl`): the store answers `401` and records nothing.
- `payment_events.outcome` explains every delivery: `fulfilled`, `duplicate`, `amount_mismatch`, `currency_mismatch`, `order_mismatch`, `unknown_order`, `refunded`, `failed`, `capture_requested`, `ignored`.
- An order is never marked paid by the browser: closing the result page changes nothing; only the verified webhook does.
- Run `pnpm maintenance:run` after the order lifetime (default 60 minutes) to expire unpaid orders and release their coupon reservations.

## Results log

Record each run here (date, gateway, scenario, outcome). Runs are pending until sandbox credentials are available on a machine that can reach the gateways.

| Date | Gateway | Scenario | Result |
| ---- | ------- | -------- | ------ |
