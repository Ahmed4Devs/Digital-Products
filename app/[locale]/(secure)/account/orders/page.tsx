import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/catalog/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { findCustomerOrders } from "@/features/library/data";
import { Link } from "@/i18n/navigation";
import { requireCustomer } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { localized } from "@/lib/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.orders");
  return { title: t("metadataTitle") };
}

const STATUS_VARIANT = {
  paid: "default",
  pending: "secondary",
  refunded: "outline",
  failed: "destructive",
  expired: "outline",
} as const;

/** Orders and receipts, separate from My Purchases (spec §10.4). */
export default async function OrdersPage() {
  const user = await requireCustomer({ next: "/account/orders" });
  const [locale, t, format, orders] = await Promise.all([
    getLocale(),
    getTranslations("account.orders"),
    getFormatter(),
    findCustomerOrders(getDb(), user.id),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      {orders.length === 0 ? (
        <EmptyState title={t("empty")}>
          <Link href="/products" className={buttonVariants()}>
            {t("browse")}
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => {
            const number = format.number(order.orderNumber, {
              numberingSystem: "latn",
              useGrouping: false,
            });
            return (
              <li key={order.id}>
                <article
                  aria-labelledby={`order-${order.id}`}
                  className="flex flex-col gap-3 rounded-xl border p-4"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 id={`order-${order.id}`} className="font-semibold">
                        {t("order", { number })}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {t("placedOn", { date: format.dateTime(order.createdAt, "dateTime") })}
                        {" · "}
                        {t(`via.${order.provider ?? "free"}`)}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[order.status]}>
                      {t(`status.${order.status}`)}
                    </Badge>
                  </header>
                  <ul aria-label={t("items")} className="flex flex-col gap-1 text-sm">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-4">
                        <span>{localized(locale, { ar: item.titleAr, en: item.titleEn })}</span>
                        <MoneyText
                          locale={locale}
                          amountMinor={item.unitPriceUsdCents}
                          currency="USD"
                        />
                      </li>
                    ))}
                  </ul>
                  <dl className="flex flex-col gap-1 border-t pt-2 text-sm">
                    {order.discountUsdCents > 0 ? (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">{t("discount")}</dt>
                        <dd>
                          −
                          <MoneyText
                            locale={locale}
                            amountMinor={order.discountUsdCents}
                            currency="USD"
                          />
                        </dd>
                      </div>
                    ) : null}
                    {order.taxUsdCents > 0 ? (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">{t("tax")}</dt>
                        <dd>
                          <MoneyText
                            locale={locale}
                            amountMinor={order.taxUsdCents}
                            currency="USD"
                          />
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-4 font-semibold">
                      <dt>{t("total")}</dt>
                      <dd>
                        <MoneyText
                          locale={locale}
                          amountMinor={order.totalUsdCents}
                          currency="USD"
                        />
                      </dd>
                    </div>
                    {order.chargedCurrency !== "USD" && order.chargedAmountMinor > 0 ? (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">{t("charged")}</dt>
                        <dd>
                          <MoneyText
                            locale={locale}
                            amountMinor={order.chargedAmountMinor}
                            currency={order.chargedCurrency}
                          />
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
