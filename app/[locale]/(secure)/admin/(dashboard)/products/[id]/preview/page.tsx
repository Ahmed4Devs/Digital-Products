import type { Metadata } from "next";
import { EyeIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProductDetailView } from "@/components/catalog/product-detail";
import { buttonVariants } from "@/components/ui/button";
import { findProductPreview } from "@/features/products/data";
import { findPublicStoreSettings } from "@/features/settings/data";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.lifecycle");
  return { title: t("preview") };
}

/** The product exactly as customers will see it, in any status (spec §11). */
export default async function ProductPreviewPage({
  params,
}: PageProps<"/[locale]/admin/products/[id]/preview">) {
  await requireOwner();
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();

  const db = getDb();
  const [locale, t, product, settings] = await Promise.all([
    getLocale(),
    getTranslations("admin.preview"),
    findProductPreview(db, parsed.data),
    findPublicStoreSettings(db),
  ]);
  if (!product) notFound();

  return (
    <div className="-mx-4 sm:-mx-6">
      <ProductDetailView
        product={product}
        locale={locale}
        usdToSarRate={settings.usdToSarRate}
        header={
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <p className="flex items-center gap-2">
              <EyeIcon aria-hidden="true" className="size-4" />
              {t("banner")}
            </p>
            <Link
              href={`/admin/products/${product.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("back")}
            </Link>
          </div>
        }
      />
    </div>
  );
}
