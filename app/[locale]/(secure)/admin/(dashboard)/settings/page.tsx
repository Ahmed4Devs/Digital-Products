import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ExchangeRateForm } from "@/components/admin/exchange-rate-form";
import { GatewaySettingsForm } from "@/components/admin/gateway-settings-form";
import { LegalContentForm } from "@/components/admin/legal-content-form";
import { LogoSettings } from "@/components/admin/logo-settings";
import { StoreSettingsForm } from "@/components/admin/store-settings-form";
import { findCheckoutSettings } from "@/features/checkout/data";
import { findAdminSettings, findPublicStoreSettings } from "@/features/settings/data";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { publicImageUrl } from "@/lib/env/public";
import { configuredProviders } from "@/lib/payments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.settings");
  return { title: t("title") };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AdminSettingsPage() {
  await requireOwner();
  const db = getDb();
  const [t, settings, publicSettings, checkout] = await Promise.all([
    getTranslations("admin.settings"),
    findAdminSettings(db),
    findPublicStoreSettings(db),
    findCheckoutSettings(db),
  ]);
  const configured = configuredProviders();
  const { legal, logoLightKey, logoDarkKey, ...store } = settings;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <Section id="store-settings" title={t("store")}>
        <StoreSettingsForm defaults={store} />
      </Section>
      <Section id="logos" title={t("logos")}>
        <LogoSettings
          light={logoLightKey ? publicImageUrl(logoLightKey) : null}
          dark={logoDarkKey ? publicImageUrl(logoDarkKey) : null}
        />
      </Section>
      <Section id="exchange-rate" title={t("exchangeRate")}>
        <ExchangeRateForm usdToSarRate={publicSettings.usdToSarRate} />
      </Section>
      <Section id="gateways" title={t("gateways")}>
        <GatewaySettingsForm
          gateways={(["moyasar", "paddle", "paypal"] as const).map((id) => ({
            id,
            configured: configured.has(id),
            enabled: checkout.enabled[id],
          }))}
        />
      </Section>
      <Section id="legal" title={t("legal")}>
        <p className="text-sm text-muted-foreground">{t("legalHint")}</p>
        <LegalContentForm texts={legal} />
      </Section>
    </div>
  );
}
