import type { Metadata } from "next";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Form from "next/form";
import type { Route } from "next";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { MoneyText } from "@/components/shared/money-text";
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
  ADMIN_PRODUCT_STATUSES,
  adminProductSearchQuery,
  findAdminProducts,
  parseAdminProductSearch,
  type AdminProductSearch,
} from "@/features/products/admin-data";
import { getPathname, Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { localized } from "@/lib/text";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.products");
  return { title: t("title") };
}

type Column = "title" | "status" | "price" | "category" | "files" | "updated";
const SORTABLE: Partial<Record<Column, AdminProductSearch["sort"]>> = {
  title: "title",
  price: "price",
  updated: "updated",
};

function hrefFor(search: AdminProductSearch, changes: Partial<AdminProductSearch>) {
  return { pathname: "/admin/products", query: adminProductSearchQuery({ ...search, ...changes }) };
}

export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/[locale]/admin/products">) {
  await requireOwner();
  const [locale, t, tStatus, format, params] = await Promise.all([
    getLocale(),
    getTranslations("admin.products"),
    getTranslations("admin.status"),
    getFormatter(),
    searchParams,
  ]);
  const search = parseAdminProductSearch(params);
  const { rows, total, pageCount } = await findAdminProducts(getDb(), search, locale);

  function sortableHead(column: Column) {
    const sort = SORTABLE[column];
    const label = t(`columns.${column}`);
    if (!sort) return <TableHead key={column}>{label}</TableHead>;
    const active = search.sort === sort;
    const nextDir = active && search.dir === "desc" ? "asc" : "desc";
    return (
      <TableHead
        aria-sort={active ? (search.dir === "asc" ? "ascending" : "descending") : undefined}
      >
        <Link
          href={hrefFor(search, { sort, dir: nextDir, page: 1 })}
          className="inline-flex items-center gap-1 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
          {active ? (
            <span className="text-muted-foreground" aria-hidden="true">
              {search.dir === "asc" ? "↑" : "↓"}
            </span>
          ) : null}
          {active ? (
            <span className="sr-only">
              {search.dir === "asc" ? t("sortAscending") : t("sortDescending")}
            </span>
          ) : null}
        </Link>
      </TableHead>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/admin/products/new" className={buttonVariants()}>
          <PlusIcon aria-hidden="true" />
          {t("new")}
        </Link>
      </div>

      <Form
        action={getPathname({ href: "/admin/products", locale }) as Route}
        aria-label={t("filters")}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="product-search">{t("search")}</Label>
          <Input
            id="product-search"
            name="q"
            type="search"
            defaultValue={search.q}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Label htmlFor="product-status">{t("statusFilter")}</Label>
          <NativeSelect id="product-status" name="status" defaultValue={search.status}>
            {ADMIN_PRODUCT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
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

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {sortableHead("title")}
                {sortableHead("status")}
                {sortableHead("price")}
                {sortableHead("category")}
                {sortableHead("files")}
                {sortableHead("updated")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const title =
                  localized(locale, { ar: row.titleAr, en: row.titleEn }) || t("untitled");
                const category = row.categoryNameAr
                  ? localized(locale, { ar: row.categoryNameAr, en: row.categoryNameEn })
                  : null;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <Link
                        href={`/admin/products/${row.id}`}
                        className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {title}
                      </Link>
                      {row.featured ? (
                        <span className="ms-2 text-xs text-muted-foreground">{t("featured")}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ProductStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <MoneyText locale={locale} amountMinor={row.priceUsdCents} currency="USD" />
                    </TableCell>
                    <TableCell className={cn(!category && "text-muted-foreground")}>
                      {category ?? t("noCategory")}
                    </TableCell>
                    <TableCell>{format.number(row.fileCount, "integer")}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format.dateTime(row.updatedAt, "dateTime")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
          {search.page > 1 ? (
            <Link
              href={hrefFor(search, { page: search.page - 1 })}
              rel="prev"
              className={buttonVariants({ variant: "outline" })}
            >
              <ChevronLeftIcon aria-hidden="true" className="rtl:-scale-x-100" />
              {t("previous")}
            </Link>
          ) : null}
          <p className="text-sm text-muted-foreground" aria-current="page">
            {t("pageStatus", { page: search.page, pageCount })}
          </p>
          {search.page < pageCount ? (
            <Link
              href={hrefFor(search, { page: search.page + 1 })}
              rel="next"
              className={buttonVariants({ variant: "outline" })}
            >
              {t("next")}
              <ChevronRightIcon aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
