import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { OrderStatusBadge } from "@/components/admin/status-badge";
import { LtrText } from "@/components/shared/ltr-text";
import { MoneyText } from "@/components/shared/money-text";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { findOverviewMetrics, SALES_WINDOW_DAYS } from "@/features/orders/metrics";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { localized } from "@/lib/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("metadataTitle") };
}

const link =
  "font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

function Stat({
  id,
  title,
  value,
  detail,
}: {
  id: string;
  title: string;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1 rounded-xl border p-4 sm:p-6">
      <h2 id={id} className="text-sm font-medium text-muted-foreground">
        {title}
      </h2>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </section>
  );
}

export default async function AdminOverviewPage() {
  const owner = await requireOwner();
  const [locale, t, format, metrics] = await Promise.all([
    getLocale(),
    getTranslations("admin.overview"),
    getFormatter(),
    findOverviewMetrics(getDb()),
  ]);
  const usd = (amountMinor: number) => (
    <MoneyText locale={locale} amountMinor={amountMinor} currency="USD" />
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("welcome", { name: owner.firstName ?? owner.name })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          id="overview-today"
          title={t("salesToday")}
          value={usd(metrics.today.salesUsdCents)}
          detail={t("paidOrders", { count: metrics.today.orders })}
        />
        <Stat
          id="overview-window"
          title={t("salesWindow", { days: SALES_WINDOW_DAYS })}
          value={usd(metrics.window.salesUsdCents)}
          detail={t("paidOrders", { count: metrics.window.orders })}
        />
        <Stat
          id="overview-pending"
          title={t("pendingOrders")}
          value={format.number(metrics.pendingOrders, "integer")}
          detail={
            <Link
              href={{ pathname: "/admin/orders", query: { status: "pending" } }}
              className={link}
            >
              {t("viewPending")}
            </Link>
          }
        />
        <Stat
          id="overview-products"
          title={t("products")}
          value={t("published", { count: metrics.products.published })}
          detail={
            <>
              {t("drafts", { count: metrics.products.drafts })}
              {" · "}
              <Link href="/admin/products" className={link}>
                {t("manageProducts")}
              </Link>
            </>
          }
        />
      </div>

      {metrics.overshootOrders > 0 ? (
        <p className="rounded-xl border border-destructive/40 p-4 text-sm">
          {t("overshoot", { count: metrics.overshootOrders })}{" "}
          <Link href={{ pathname: "/admin/orders", query: { overshoot: "1" } }} className={link}>
            {t("reviewOvershoot")}
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="overview-top" className="flex flex-col gap-3">
          <h2 id="overview-top" className="text-lg font-semibold">
            {t("topProducts", { days: SALES_WINDOW_DAYS })}
          </h2>
          {metrics.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSales")}</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("product")}</TableHead>
                    <TableHead>{t("sold")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.topProducts.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="max-w-80 whitespace-normal">
                        <Link href={`/admin/products/${row.productId}`} className={link}>
                          {localized(locale, { ar: row.titleAr, en: row.titleEn })}
                        </Link>
                      </TableCell>
                      <TableCell>{format.number(row.sold, "integer")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section aria-labelledby="overview-recent" className="flex flex-col gap-3">
          <h2 id="overview-recent" className="text-lg font-semibold">
            {t("recentOrders")}
          </h2>
          {metrics.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOrders")}</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("order")}</TableHead>
                    <TableHead>{t("customer")}</TableHead>
                    <TableHead>{t("charged")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link href={`/admin/orders/${order.id}`} className={link}>
                          {t("orderNumber", { number: String(order.orderNumber) })}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {format.dateTime(order.createdAt, "dateTime")}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        <LtrText>{order.customerEmailSnapshot}</LtrText>
                      </TableCell>
                      <TableCell>
                        <MoneyText
                          locale={locale}
                          amountMinor={order.chargedAmountMinor}
                          currency={order.chargedCurrency}
                        />
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Link
            href="/admin/orders"
            className={buttonVariants({ variant: "outline", className: "self-start" })}
          >
            {t("allOrders")}
          </Link>
        </section>
      </div>
    </div>
  );
}
