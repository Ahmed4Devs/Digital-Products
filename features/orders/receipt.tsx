import "server-only";
import { render } from "react-email";
import { ReceiptEmail, receiptSubject } from "@/emails/receipt-email";
import type { PrismaClient } from "@/generated/prisma/client";
import { runInBackground } from "@/lib/auth/background";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env/public";
import { localized } from "@/lib/text";
import { messagesByLocale } from "@/messages";

// Receipt emails (spec §10.1 step 10, §10.5): sent after the payment has committed, in
// the order's language. A failure is logged and never affects fulfilment; the owner can
// resend (Phase 8).

/** Sends the receipt of a paid order; false when there is nothing to send. */
export async function sendReceipt(db: PrismaClient, orderId: string): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.status !== "paid" || !order.paidAt) return false;

  const settings = await db.storeSetting.findUnique({
    where: { id: 1 },
    select: { storeNameAr: true, storeNameEn: true },
  });
  const locale = order.locale;
  const storeName =
    localized(locale, { ar: settings?.storeNameAr, en: settings?.storeNameEn }) ||
    messagesByLocale[locale].common.storeName;

  const props = {
    locale,
    storeName,
    orderNumber: order.orderNumber,
    paidAt: order.paidAt,
    lines: order.items.map((item) => ({
      title: localized(locale, { ar: item.titleAr, en: item.titleEn }),
      amountMinor: item.unitPriceUsdCents,
    })),
    subtotalUsdCents: order.subtotalUsdCents,
    discountUsdCents: order.discountUsdCents,
    taxUsdCents: order.taxUsdCents,
    totalUsdCents: order.totalUsdCents,
    charged:
      order.chargedCurrency !== "USD" && order.chargedAmountMinor > 0
        ? { currency: order.chargedCurrency, amountMinor: order.chargedAmountMinor }
        : null,
    libraryUrl: new URL(`/${locale}/account/library`, appUrl()).toString(),
  };
  const element = <ReceiptEmail {...props} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  await sendEmail({ to: order.customerEmailSnapshot, subject: receiptSubject(props), html, text });
  return true;
}

/** Queues the receipt after the response; failures are logged by class only. */
export function queueReceipt(orderId: string): void {
  runInBackground(sendReceipt(getDb(), orderId), "receipt email");
}
