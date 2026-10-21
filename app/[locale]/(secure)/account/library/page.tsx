import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/auth/form-alert";
import { EmptyState } from "@/components/catalog/empty-state";
import { ProductImage } from "@/components/catalog/product-image";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { findLibrary } from "@/features/library/data";
import { Link } from "@/i18n/navigation";
import { requireCustomer } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { localized } from "@/lib/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.library");
  return { title: t("metadataTitle") };
}

/** My Purchases (spec §10.4): owned products with one download button per file. */
export default async function LibraryPage({
  searchParams,
}: PageProps<"/[locale]/account/library">) {
  const user = await requireCustomer({ next: "/account/library" });
  const [locale, t, format, entries, query] = await Promise.all([
    getLocale(),
    getTranslations("account.library"),
    getFormatter(),
    findLibrary(getDb(), user.id),
    searchParams,
  ]);
  const notice =
    query.notice === "rateLimited" || query.notice === "unavailable" ? query.notice : null;

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      {notice ? <FormAlert tone="error">{t(notice)}</FormAlert> : null}
      {entries.length === 0 ? (
        <EmptyState title={t("empty")}>
          <Link href="/products" className={buttonVariants()}>
            {t("browse")}
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {entries.map((entry) => {
            const title = localized(locale, {
              ar: entry.product.titleAr,
              en: entry.product.titleEn,
            });
            return (
              <li key={entry.id} className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row">
                <div className="w-full shrink-0 sm:w-32">
                  <ProductImage
                    image={entry.product.cover}
                    title={title}
                    locale={locale}
                    sizes="(min-width: 640px) 128px, 100vw"
                    className="rounded-lg border"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("purchasedOn", { date: format.dateTime(entry.purchasedAt, "date") })}
                    </p>
                  </div>
                  {entry.files.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noFiles")}</p>
                  ) : (
                    <ul aria-label={t("files")} className="flex flex-col gap-2">
                      {entry.files.map((file) => (
                        <li key={file.id} className="flex flex-wrap items-center gap-2">
                          {/* A plain link: the gateway answers with a redirect to storage. */}
                          <a
                            href={`/api/downloads/${entry.id}/${file.id}?locale=${locale}`}
                            className={buttonVariants({ variant: "outline" })}
                            aria-label={t("download", { name: file.fileName })}
                          >
                            <DownloadIcon aria-hidden="true" />
                            <bdi>{file.fileName}</bdi>
                          </a>
                          {file.updated ? (
                            <Badge title={t("updatedHint")}>{t("updated")}</Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
