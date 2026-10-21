import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CategoryManager } from "@/components/admin/category-manager";
import { findAdminCategories } from "@/features/products/admin-data";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.categories");
  return { title: t("title") };
}

export default async function AdminCategoriesPage() {
  await requireOwner();
  const [t, categories] = await Promise.all([
    getTranslations("admin.categories"),
    findAdminCategories(getDb()),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <CategoryManager categories={categories} />
    </div>
  );
}
