import type { Metadata } from "next";
import { ArrowLeftIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  BanButton,
  GrantProductForm,
  RevokeEntitlementButton,
} from "@/components/admin/customer-actions";
import { CustomerStatusBadge, OrderStatusBadge } from "@/components/admin/status-badge";
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
import { findAdminCustomer, findGrantableProducts } from "@/features/customers/admin-data";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { localized } from "@/lib/text";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const link =
  "font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.customerDetail");
  return { title: t("metadataTitle") };
}

export default async function AdminCustomerPage({
  params,
}: PageProps<"/[locale]/admin/customers/[id]">) {
  await requireOwner();
  const [{ id }, locale, t, format] = await Promise.all([
    params,
    getLocale(),
    getTranslations("admin.customerDetail"),
    getFormatter(),
  ]);
  if (!uuid.test(id)) notFound();
  const db = getDb();
  const [customer, grantable] = await Promise.all([
    findAdminCustomer(db, id),
    findGrantableProducts(db, id),
  ]);
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/customers"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight break-all">
          <LtrText>{customer.email}</LtrText>
        </h1>
        <CustomerStatusBadge customer={customer} />
      </div>

      <section
        aria-labelledby="customer-summary"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="customer-summary" className="text-lg font-semibold">
          {t("summary")}
        </h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t("joined")}</dt>
          <dd>{format.dateTime(customer.createdAt, "dateTime")}</dd>
          <dt className="text-muted-foreground">{t("language")}</dt>
          <dd>{t(`languages.${customer.preferredLocale}`)}</dd>
          <dt className="text-muted-foreground">{t("spent")}</dt>
          <dd>
            <MoneyText locale={locale} amountMinor={customer.spentUsdCents} currency="USD" />
          </dd>
        </dl>
        <p className="text-sm text-muted-foreground">
          {customer.banned ? t("bannedHint") : t("banHint")}
        </p>
        <BanButton userId={customer.id} banned={customer.banned} />
      </section>

      <section aria-labelledby="customer-products" className="flex flex-col gap-4">
        <h2 id="customer-products" className="text-lg font-semibold">
          {t("products")}
        </h2>
        {customer.entitlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noProducts")}</p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead>{t("source")}</TableHead>
                  <TableHead>{t("access")}</TableHead>
                  <TableHead>{t("downloads")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("accessActions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.entitlements.map((entitlement) => {
                  const title = localized(locale, {
                    ar: entitlement.product.titleAr,
                    en: entitlement.product.titleEn,
                  });
                  const order = entitlement.orderItem?.order;
                  return (
                    <TableRow key={entitlement.id}>
                      <TableCell className="max-w-80 whitespace-normal">
                        <Link href={`/admin/products/${entitlement.product.id}`} className={link}>
                          {title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {order ? (
                          <Link href={`/admin/orders/${order.id}`} className={link}>
                            {t("fromOrder", { number: String(order.orderNumber) })}
                          </Link>
                        ) : (
                          t("grantedByOwner")
                        )}
                      </TableCell>
                      <TableCell>
                        {entitlement.revokedAt ? (
                          <Badge variant="outline">{t("accessRevoked")}</Badge>
                        ) : (
                          <Badge>{t("accessActive")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{format.number(entitlement.downloadCount, "integer")}</TableCell>
                      <TableCell>
                        {entitlement.revokedAt ? null : (
                          <RevokeEntitlementButton
                            userId={customer.id}
                            entitlementId={entitlement.id}
                            productTitle={title}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <GrantProductForm
          userId={customer.id}
          products={grantable.map((product) => ({
            id: product.id,
            title: localized(locale, { ar: product.titleAr, en: product.titleEn }),
            archived: product.status === "archived",
          }))}
        />
      </section>

      <section aria-labelledby="customer-orders" className="flex flex-col gap-4">
        <h2 id="customer-orders" className="text-lg font-semibold">
          {t("orders")}
        </h2>
        {customer.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noOrders")}</p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("order")}</TableHead>
                  <TableHead>{t("placed")}</TableHead>
                  <TableHead>{t("charged")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${order.id}`} className={link}>
                        {t("orderNumber", { number: String(order.orderNumber) })}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format.dateTime(order.createdAt, "dateTime")}
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
      </section>
    </div>
  );
}
