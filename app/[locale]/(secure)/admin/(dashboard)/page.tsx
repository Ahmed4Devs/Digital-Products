import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("metadataTitle") };
}

export default async function AdminOverviewPage() {
  const owner = await requireOwner();
  const db = getDb();
  const [t, published, drafts] = await Promise.all([
    getTranslations("admin.overview"),
    db.product.count({ where: { status: "published" } }),
    db.product.count({ where: { status: "draft" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("welcome", { name: owner.firstName ?? owner.name })}
        </p>
      </div>
      <section
        aria-labelledby="overview-products"
        className="flex max-w-sm flex-col gap-3 rounded-xl border p-6"
      >
        <h2 id="overview-products" className="font-semibold">
          {t("products")}
        </h2>
        <p className="text-2xl font-semibold">{t("published", { count: published })}</p>
        <p className="text-sm text-muted-foreground">{t("drafts", { count: drafts })}</p>
        <Link
          href="/admin/products"
          className={buttonVariants({ variant: "outline", className: "self-start" })}
        >
          {t("manageProducts")}
        </Link>
      </section>
    </div>
  );
}
