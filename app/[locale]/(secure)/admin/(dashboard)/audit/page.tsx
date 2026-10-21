import type { Metadata, Route } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Form from "next/form";
import { Pagination } from "@/components/admin/pagination";
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
  AUDIT_ENTITIES,
  auditSearchQuery,
  findAuditLog,
  parseAuditSearch,
} from "@/features/audit/admin-data";
import { getPathname, Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import type { AuditValue } from "@/lib/audit";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.audit");
  return { title: t("title") };
}

const ENTITY_PAGES: Partial<Record<string, string>> = {
  product: "/admin/products",
  order: "/admin/orders",
  user: "/admin/customers",
  coupon: "/admin/coupons",
};

export default async function AuditLogPage({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  await requireOwner();
  const [locale, t, format, params] = await Promise.all([
    getLocale(),
    getTranslations("admin.audit"),
    getFormatter(),
    searchParams,
  ]);
  const search = parseAuditSearch(params);
  const { entries, total, pageCount } = await findAuditLog(getDb(), search);

  function actionLabel(action: string) {
    const key = `actions.${action}`;
    return t.has(key as never) ? t(key as never) : action;
  }
  function value(item: AuditValue) {
    if (item === null) return <span className="text-muted-foreground">{t("empty")}</span>;
    if (typeof item === "boolean") return item ? t("yes") : t("no");
    return <bdi className="break-all">{String(item)}</bdi>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <Form
        action={getPathname({ href: "/admin/audit", locale }) as Route}
        aria-label={t("filters")}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex flex-col gap-2 sm:w-56">
          <Label htmlFor="audit-entity">{t("entityFilter")}</Label>
          <NativeSelect id="audit-entity" name="entity" defaultValue={search.entity}>
            {AUDIT_ENTITIES.map((entity) => (
              <option key={entity} value={entity}>
                {t(`entities.${entity}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="audit-entity-id">{t("entityId")}</Label>
          <Input
            id="audit-entity-id"
            name="entityId"
            defaultValue={search.entityId}
            dir="ltr"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="outline" size="lg">
          {t("apply")}
        </Button>
      </Form>

      <p role="status" className="text-sm text-muted-foreground">
        {t("results", { count: total })}
      </p>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("none")}
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.time")}</TableHead>
                <TableHead>{t("columns.action")}</TableHead>
                <TableHead>{t("columns.entity")}</TableHead>
                <TableHead>{t("columns.changes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const page = ENTITY_PAGES[entry.entity];
                return (
                  <TableRow key={entry.id} className="align-top">
                    <TableCell className="text-muted-foreground">
                      {format.dateTime(entry.createdAt, "dateTime")}
                      <span className="block text-xs">
                        {entry.actor ? <LtrText>{entry.actor}</LtrText> : t("system")}
                      </span>
                    </TableCell>
                    <TableCell>{actionLabel(entry.action)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {t.has(`entities.${entry.entity}` as never)
                        ? t(`entities.${entry.entity}` as never)
                        : entry.entity}
                      {entry.entityId ? (
                        <span className="block max-w-56 truncate text-xs">
                          {page && entry.action !== "product.delete" ? (
                            <Link
                              href={`${page}/${entry.entityId}` as Route}
                              className="underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <LtrText>{entry.entityId}</LtrText>
                            </Link>
                          ) : (
                            <LtrText>{entry.entityId}</LtrText>
                          )}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-72 whitespace-normal">
                      {entry.changes.length === 0 && entry.details.length === 0 ? (
                        <span className="text-muted-foreground">{t("noChanges")}</span>
                      ) : (
                        <dl className="flex flex-col gap-1 text-xs">
                          {entry.changes.map((change) => (
                            <div key={change.field}>
                              <dt className="font-medium">
                                <LtrText>{change.field}</LtrText>
                              </dt>
                              <dd>
                                {t.rich("change", {
                                  from: () => value(change.from),
                                  to: () => value(change.to),
                                })}
                              </dd>
                            </div>
                          ))}
                          {entry.details.map((detail) => (
                            <div key={detail.field}>
                              <dt className="font-medium">
                                <LtrText>{detail.field}</LtrText>
                              </dt>
                              <dd>{value(detail.value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        page={search.page}
        pageCount={pageCount}
        hrefFor={(page) => ({
          pathname: "/admin/audit",
          query: auditSearchQuery({ ...search, page }),
        })}
      />
    </div>
  );
}
