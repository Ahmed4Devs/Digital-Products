import type { Metadata } from "next";
import { ArrowLeftIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { CouponDiscount } from "@/components/admin/coupon-discount";
import { CouponActiveButton, CouponForm } from "@/components/admin/coupon-form";
import { CouponStateBadge, OrderStatusBadge } from "@/components/admin/status-badge";
import { LtrText } from "@/components/shared/ltr-text";
import { MoneyText } from "@/components/shared/money-text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { couponFormDefaults, couponState, findAdminCoupon } from "@/features/coupons/admin-data";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const link =
  "font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.couponForm");
  return { title: t("editTitle") };
}

export default async function AdminCouponPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/coupons/[id]">) {
  await requireOwner();
  const [{ id }, query, locale, t, tRedemption, format] = await Promise.all([
    params,
    searchParams,
    getLocale(),
    getTranslations("admin.couponForm"),
    getTranslations("admin.couponRedemptions"),
    getFormatter(),
  ]);
  if (!uuid.test(id)) notFound();
  const found = await findAdminCoupon(getDb(), id);
  if (!found) notFound();
  const { coupon, redemptions } = found;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/coupons"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          <LtrText>{coupon.code}</LtrText>
        </h1>
        <CouponStateBadge state={couponState(coupon, new Date())} />
      </div>
      {query.created ? <FormAlert tone="success">{t("createdNotice")}</FormAlert> : null}

      <section
        aria-labelledby="coupon-usage"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="coupon-usage" className="text-lg font-semibold">
          {t("usage")}
        </h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t("discount")}</dt>
          <dd>
            <CouponDiscount locale={locale} type={coupon.type} value={coupon.value} />
          </dd>
          <dt className="text-muted-foreground">{t("used")}</dt>
          <dd>
            {coupon.usageLimit === null
              ? t("usedUnlimited", { used: coupon.usedCount })
              : t("usedOf", { used: coupon.usedCount, limit: coupon.usageLimit })}
          </dd>
          <dt className="text-muted-foreground">{t("reserved")}</dt>
          <dd>{format.number(coupon.reservedCount, "integer")}</dd>
          <dt className="text-muted-foreground">{t("discountGiven")}</dt>
          <dd>
            <MoneyText locale={locale} amountMinor={found.discountGivenUsdCents} currency="USD" />
          </dd>
        </dl>
        <CouponActiveButton couponId={coupon.id} active={coupon.active} />
      </section>

      <section aria-labelledby="coupon-edit" className="flex flex-col gap-4">
        <h2 id="coupon-edit" className="text-lg font-semibold">
          {t("editTitle")}
        </h2>
        <CouponForm couponId={coupon.id} defaults={couponFormDefaults(coupon)} />
      </section>

      <section aria-labelledby="coupon-redemptions" className="flex flex-col gap-4">
        <h2 id="coupon-redemptions" className="text-lg font-semibold">
          {tRedemption("title")}
        </h2>
        {redemptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tRedemption("empty")}</p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tRedemption("order")}</TableHead>
                  <TableHead>{tRedemption("customer")}</TableHead>
                  <TableHead>{tRedemption("discount")}</TableHead>
                  <TableHead>{tRedemption("use")}</TableHead>
                  <TableHead>{tRedemption("orderStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redemptions.map((redemption) => (
                  <TableRow key={redemption.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${redemption.order.id}`} className={link}>
                        {tRedemption("orderNumber", {
                          number: String(redemption.order.orderNumber),
                        })}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {format.dateTime(redemption.createdAt, "dateTime")}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      <LtrText>{redemption.order.customerEmailSnapshot}</LtrText>
                    </TableCell>
                    <TableCell>
                      <MoneyText
                        locale={locale}
                        amountMinor={redemption.order.discountUsdCents}
                        currency="USD"
                      />
                    </TableCell>
                    <TableCell>{tRedemption(`statuses.${redemption.status}`)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={redemption.order.status} />
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
