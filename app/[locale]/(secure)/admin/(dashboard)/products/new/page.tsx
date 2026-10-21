import type { Metadata } from "next";
import { ChevronLeftIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ProductForm } from "@/components/admin/product-form";
import { buttonVariants } from "@/components/ui/button";
import { findCategoryOptions } from "@/features/products/admin-data";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { localized } from "@/lib/text";
import { EMPTY_PRODUCT } from "../form-defaults";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.productForm");
  return { title: t("createTitle") };
}

export default async function NewProductPage() {
  await requireOwner();
  const [locale, t, categories] = await Promise.all([
    getLocale(),
    getTranslations("admin.productForm"),
    findCategoryOptions(getDb()),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/products"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
      >
        <ChevronLeftIcon aria-hidden="true" className="rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t("createTitle")}</h1>
      <ProductForm
        defaults={EMPTY_PRODUCT}
        categories={categories.map((category) => ({
          id: category.id,
          name: localized(locale, { ar: category.nameAr, en: category.nameEn }),
        }))}
      />
    </div>
  );
}
