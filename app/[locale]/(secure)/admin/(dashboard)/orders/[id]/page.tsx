import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ItemAccessButton, OrderActions } from "@/components/admin/order-actions";
import { OrderStatusBadge } from "@/components/admin/status-badge";
import { LtrText } from "@/components/shared/ltr-text";
import { MoneyText } from "@/components/shared/money-text";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { findAdminOrder } from "@/features/orders/admin-data";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { localized } from "@/lib/text";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/orders/[id]">): Promise<Metadata> {
  const [{ id }, t] = await Promise.all([params, getTranslations("admin.orderDetail")]);
  const order = uuid.test(id) ? await findAdminOrder(getDb(), id) : null;
  return { title: order ? t("title", { number: String(order.orderNumber) }) : t("notFound") };
}

export default async function AdminOrderPage({ params }: PageProps<"/[locale]/admin/orders/[id]">) {
  await requireOwner();
  const [{ id }, locale, t, tVia, format] = await Promise.all([
    params,
    getLocale(),
    getTranslations("admin.orderDetail"),
    getTranslations("account.orders.via"),
    getFormatter(),
  ]);
  if (!uuid.test(id)) notFound();
  const order = await findAdminOrder(getDb(), id);
  if (!order) notFound();

  const usd = (amountMinor: number) => (
    <MoneyText locale={locale} amountMinor={amountMinor} currency="USD" />
  );
  const link =
    "underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  const facts: { label: string; value: ReactNode }[] = [
    { label: t("placedOn"), value: format.dateTime(order.createdAt, "dateTime") },
  ];
  if (order.paidAt)
    facts.push({ label: t("paidAt"), value: format.dateTime(order.paidAt, "dateTime") });
  if (order.refundedAt) {
    facts.push({ label: t("refundedAt"), value: format.dateTime(order.refundedAt, "dateTime") });
  }
  facts.push({
    label: t("customer"),
    value: order.user ? (
      <Link href={`/admin/customers/${order.user.id}`} className={link}>
        <LtrText>{order.user.email}</LtrText>
      </Link>
    ) : (
      t.rich("accountDeleted", { email: () => <LtrText>{order.customerEmailSnapshot}</LtrText> })
    ),
  });
  facts.push({ label: t("language"), value: t(`languages.${order.locale}`) });
  facts.push({ label: t("gateway"), value: tVia(order.provider ?? "free") });
  if (order.providerReference) {
    facts.push({ label: t("reference"), value: <LtrText>{order.providerReference}</LtrText> });
  }
  if (order.coupon)
    facts.push({ label: t("coupon"), value: <LtrText>{order.coupon.code}</LtrText> });
  facts.push({ label: t("exchangeRate"), value: <LtrText>{order.exchangeRateUsed}</LtrText> });

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/orders"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("title", { number: String(order.orderNumber) })}
        </h1>
        <OrderStatusBadge status={order.status} />
        {order.couponOvershoot ? <Badge variant="destructive">{t("overshoot")}</Badge> : null}
      </div>
      {order.couponOvershoot ? (
        <p className="text-sm text-muted-foreground">{t("overshootHint")}</p>
      ) : null}

      <OrderActions
        orderId={order.id}
        canResend={order.status === "paid"}
        canRefund={order.status === "paid"}
      />

      <section
        aria-labelledby="order-summary"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="order-summary" className="text-lg font-semibold">
          {t("summary")}
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          {facts.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="order-items" className="flex flex-col gap-4">
        <h2 id="order-items" className="text-lg font-semibold">
          {t("items")}
        </h2>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("product")}</TableHead>
                <TableHead>{t("price")}</TableHead>
                <TableHead>{t("access")}</TableHead>
                <TableHead>{t("downloads")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("accessActions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => {
                const title = localized(locale, { ar: item.titleAr, en: item.titleEn });
                const active = Boolean(item.entitlement && !item.entitlement.revokedAt);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <Link
                        href={`/admin/products/${item.productId}`}
                        className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {title}
                      </Link>
                    </TableCell>
                    <TableCell>{usd(item.unitPriceUsdCents)}</TableCell>
                    <TableCell>
                      {active ? (
                        <Badge>{t("accessActive")}</Badge>
                      ) : item.entitlement ? (
                        <Badge variant="outline">{t("accessRevoked")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("accessNone")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {format.number(item.entitlement?.downloadCount ?? 0, "integer")}
                    </TableCell>
                    <TableCell>
                      {order.user ? (
                        <ItemAccessButton
                          orderId={order.id}
                          orderItemId={item.id}
                          active={active}
                          canGrant={order.status === "paid"}
                          productTitle={title}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <dl className="ms-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("subtotal")}</dt>
          <dd className="text-end">{usd(order.subtotalUsdCents)}</dd>
          {order.discountUsdCents > 0 ? (
            <>
              <dt className="text-muted-foreground">{t("discount")}</dt>
              <dd className="text-end">{usd(-order.discountUsdCents)}</dd>
            </>
          ) : null}
          {order.taxUsdCents > 0 ? (
            <>
              <dt className="text-muted-foreground">{t("tax")}</dt>
              <dd className="text-end">{usd(order.taxUsdCents)}</dd>
            </>
          ) : null}
          <dt className="font-medium">{t("total")}</dt>
          <dd className="text-end font-medium">{usd(order.totalUsdCents)}</dd>
          <dt className="text-muted-foreground">{t("charged")}</dt>
          <dd className="text-end">
            <MoneyText
              locale={locale}
              amountMinor={order.chargedAmountMinor}
              currency={order.chargedCurrency}
            />
          </dd>
        </dl>
      </section>

      <section aria-labelledby="order-events" className="flex flex-col gap-4">
        <h2 id="order-events" className="text-lg font-semibold">
          {t("events")}
        </h2>
        {order.paymentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("eventReceived")}</TableHead>
                  <TableHead>{t("eventType")}</TableHead>
                  <TableHead>{t("eventOutcome")}</TableHead>
                  <TableHead>{t("eventId")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.paymentEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-muted-foreground">
                      {format.dateTime(event.createdAt, "dateTime")}
                    </TableCell>
                    <TableCell>
                      <LtrText>{event.type}</LtrText>
                    </TableCell>
                    <TableCell>
                      <LtrText>{event.outcome ?? "—"}</LtrText>
                    </TableCell>
                    <TableCell className="max-w-60 truncate">
                      <LtrText>{event.providerEventId}</LtrText>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
