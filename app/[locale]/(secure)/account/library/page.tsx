import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/catalog/empty-state";
import { ProductImage } from "@/components/catalog/product-image";
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

/** My Purchases (spec §10.4). Download buttons arrive with delivery (Phase 7). */
export default async function LibraryPage() {
  const user = await requireCustomer({ next: "/account/library" });
  const [locale, t, format, entries] = await Promise.all([
    getLocale(),
    getTranslations("account.library"),
    getFormatter(),
    findLibrary(getDb(), user.id),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      {entries.length === 0 ? (
        <EmptyState title={t("empty")}>
          <Link href="/products" className={buttonVariants()}>
            {t("browse")}
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => {
            const title = localized(locale, {
              ar: entry.product.titleAr,
              en: entry.product.titleEn,
            });
            return (
              <li key={entry.id} className="flex gap-4 rounded-xl border p-4">
                <div className="w-24 shrink-0">
                  <ProductImage
                    image={entry.product.cover}
                    title={title}
                    locale={locale}
                    sizes="96px"
                    className="rounded-lg border"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="font-semibold">{title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("purchasedOn", { date: format.dateTime(entry.purchasedAt, "date") })}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("downloadsSoon")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
