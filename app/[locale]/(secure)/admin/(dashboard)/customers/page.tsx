import type { Metadata, Route } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Form from "next/form";
import { Pagination } from "@/components/admin/pagination";
import { CustomerStatusBadge } from "@/components/admin/status-badge";
import { LtrText } from "@/components/shared/ltr-text";
import { Button } from "@/components/ui/button";
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
  ADMIN_CUSTOMER_STATUSES,
  adminCustomerSearchQuery,
  findAdminCustomers,
  parseAdminCustomerSearch,
} from "@/features/customers/admin-data";
import { getPathname, Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.customers");
  return { title: t("title") };
}

export default async function AdminCustomersPage({
  searchParams,
}: PageProps<"/[locale]/admin/customers">) {
  await requireOwner();
  const [locale, t, format, params] = await Promise.all([
    getLocale(),
    getTranslations("admin.customers"),
    getFormatter(),
    searchParams,
  ]);
  const search = parseAdminCustomerSearch(params);
  const { customers, total, pageCount } = await findAdminCustomers(getDb(), search);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

      <Form
        action={getPathname({ href: "/admin/customers", locale }) as Route}
        aria-label={t("filters")}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="customer-search">{t("search")}</Label>
          <Input
            id="customer-search"
            name="q"
            type="search"
            defaultValue={search.q}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Label htmlFor="customer-status">{t("statusFilter")}</Label>
          <NativeSelect id="customer-status" name="status" defaultValue={search.status}>
            {ADMIN_CUSTOMER_STATUSES.map((status) => (
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

      {customers.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.email")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.orders")}</TableHead>
                <TableHead>{t("columns.products")}</TableHead>
                <TableHead>{t("columns.joined")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link
                      href={`/admin/customers/${customer.id}`}
                      className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <LtrText>{customer.email}</LtrText>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CustomerStatusBadge customer={customer} />
                  </TableCell>
                  <TableCell>{format.number(customer._count.orders, "integer")}</TableCell>
                  <TableCell>{format.number(customer._count.entitlements, "integer")}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format.dateTime(customer.createdAt, "date")}
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
          pathname: "/admin/customers",
          query: adminCustomerSearchQuery({ ...search, page }),
        })}
      />
    </div>
  );
}
