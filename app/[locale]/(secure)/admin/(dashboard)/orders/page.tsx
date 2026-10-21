import type { Metadata, Route } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Form from "next/form";
import { Pagination } from "@/components/admin/pagination";
import { OrderStatusBadge } from "@/components/admin/status-badge";
import { LtrText } from "@/components/shared/ltr-text";
import { MoneyText } from "@/components/shared/money-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  ADMIN_ORDER_STATUSES,
  adminOrderSearchQuery,
  findAdminOrders,
  parseAdminOrderSearch,
} from "@/features/orders/admin-data";
import { getPathname, Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.orders");
  return { title: t("title") };
}

export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/[locale]/admin/orders">) {
  await requireOwner();
  const [locale, t, tStatus, format, params] = await Promise.all([
    getLocale(),
    getTranslations("admin.orders"),
    getTranslations("admin.orderStatus"),
    getFormatter(),
    searchParams,
  ]);
  const search = parseAdminOrderSearch(params);
  const { orders, total, pageCount } = await findAdminOrders(getDb(), search);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

      <Form
        action={getPathname({ href: "/admin/orders", locale }) as Route}
        aria-label={t("filters")}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="order-search">{t("search")}</Label>
          <Input
            id="order-search"
            name="q"
            type="search"
            defaultValue={search.q}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="order-status">{t("statusFilter")}</Label>
          <NativeSelect id="order-status" name="status" defaultValue={search.status}>
            {ADMIN_ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="order-from">{t("from")}</Label>
          <Input id="order-from" name="from" type="date" defaultValue={search.from} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="order-to">{t("to")}</Label>
          <Input id="order-to" name="to" type="date" defaultValue={search.to} />
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="order-overshoot"
              name="overshoot"
              value="1"
              defaultChecked={Boolean(search.overshoot)}
            />
            <Label htmlFor="order-overshoot">{t("overshootOnly")}</Label>
          </div>
          <Button type="submit" variant="outline" size="lg">
            {t("apply")}
          </Button>
        </div>
      </Form>

      <p role="status" className="text-sm text-muted-foreground">
        {t("results", { count: total })}
      </p>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.number")}</TableHead>
                <TableHead>{t("columns.date")}</TableHead>
                <TableHead>{t("columns.customer")}</TableHead>
                <TableHead>{t("columns.items")}</TableHead>
                <TableHead>{t("columns.total")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {t("number", { number: String(order.orderNumber) })}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format.dateTime(order.createdAt, "dateTime")}
                  </TableCell>
                  <TableCell>
                    <LtrText>{order.customerEmailSnapshot}</LtrText>
                  </TableCell>
                  <TableCell>{format.number(order._count.items, "integer")}</TableCell>
                  <TableCell>
                    <MoneyText
                      locale={locale}
                      amountMinor={order.chargedAmountMinor}
                      currency={order.chargedCurrency}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      <OrderStatusBadge status={order.status} />
                      {order.couponOvershoot ? (
                        <Badge variant="destructive">{t("overshoot")}</Badge>
                      ) : null}
                    </span>
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
          pathname: "/admin/orders",
          query: adminOrderSearchQuery({ ...search, page }),
        })}
      />
    </div>
  );
}
