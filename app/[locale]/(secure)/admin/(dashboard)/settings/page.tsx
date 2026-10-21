import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExchangeRateForm } from "@/components/admin/exchange-rate-form";
import { findPublicStoreSettings } from "@/features/settings/data";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.settings");
  return { title: t("title") };
}

export default async function AdminSettingsPage() {
  await requireOwner();
  const [t, settings] = await Promise.all([
    getTranslations("admin.settings"),
    findPublicStoreSettings(getDb()),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <section
        aria-labelledby="exchange-rate"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="exchange-rate" className="text-lg font-semibold">
          {t("exchangeRate")}
        </h2>
        <ExchangeRateForm usdToSarRate={settings.usdToSarRate} />
      </section>
    </div>
  );
}
