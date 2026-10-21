import type { Metadata, Route } from "next";
import { PlusIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Form from "next/form";
import { CouponDiscount } from "@/components/admin/coupon-discount";
import { Pagination } from "@/components/admin/pagination";
import { CouponStateBadge } from "@/components/admin/status-badge";
import { LtrText } from "@/components/shared/ltr-text";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_COUPON_STATUSES,
  adminCouponSearchQuery,
  couponState,
  findAdminCoupons,
  parseAdminCouponSearch,
} from "@/features/coupons/admin-data";
import { getPathname, Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.coupons");
  return { title: t("title") };
}

export default async function AdminCouponsPage({
  searchParams,
}: PageProps<"/[locale]/admin/coupons">) {
  await requireOwner();
  const [locale, t, format, params] = await Promise.all([
    getLocale(),
    getTranslations("admin.coupons"),
    getFormatter(),
    searchParams,
  ]);
  const search = parseAdminCouponSearch(params);
  const { coupons, total, pageCount } = await findAdminCoupons(getDb(), search);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/admin/coupons/new" className={buttonVariants()}>
          <PlusIcon aria-hidden="true" />
          {t("new")}
        </Link>
      </div>

      <Form
        action={getPathname({ href: "/admin/coupons", locale }) as Route}
        aria-label={t("filters")}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="coupon-search">{t("search")}</Label>
          <Input id="coupon-search" name="q" type="search" defaultValue={search.q} dir="ltr" />
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Label htmlFor="coupon-status">{t("statusFilter")}</Label>
          <NativeSelect id="coupon-status" name="status" defaultValue={search.status}>
            {ADMIN_COUPON_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" size="lg">
          {t("apply")}
        </Button>
      </Form>

      <p role="status" className="text-sm text-muted-foreground">
        {t("results", { count: total })}
      </p>

      {coupons.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.code")}</TableHead>
                <TableHead>{t("columns.discount")}</TableHead>
                <TableHead>{t("columns.usage")}</TableHead>
                <TableHead>{t("columns.ends")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <Link
                      href={`/admin/coupons/${coupon.id}`}
                      className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <LtrText>{coupon.code}</LtrText>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CouponDiscount locale={locale} type={coupon.type} value={coupon.value} />
                  </TableCell>
                  <TableCell>
                    {coupon.usageLimit === null
                      ? t("usageUnlimited", { used: coupon.usedCount })
                      : t("usageOf", { used: coupon.usedCount, limit: coupon.usageLimit })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {coupon.endsAt ? format.dateTime(coupon.endsAt, "dateTime") : t("noEnd")}
                  </TableCell>
                  <TableCell>
                    <CouponStateBadge state={couponState(coupon, now)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        page={search.page}
        pageCount={pageCount}
        hrefFor={(page) => ({
          pathname: "/admin/coupons",
          query: adminCouponSearchQuery({ ...search, page }),
        })}
      />
    </div>
  );
}
