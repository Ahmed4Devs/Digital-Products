import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOwner } from "@/lib/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("metadataTitle") };
}

export default async function AdminOverviewPage() {
  const [t, owner] = await Promise.all([getTranslations("admin.overview"), requireOwner()]);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">
        {t("welcome", { name: owner.firstName ?? owner.name })}
      </p>
    </section>
  );
}
