import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { FakeCheckout } from "@/components/checkout/fake-checkout";
import { MoneyText } from "@/components/shared/money-text";
import { requireCustomer } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { configuredProviders } from "@/lib/payments";
import { decodeFakeReference } from "@/lib/payments/fake";

// Stands in for a provider's hosted checkout in automated tests. Exists only with
// TEST_DOUBLES=on, which is refused unless APP_URL is loopback.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.fake");
  return { title: t("title") };
}

export default async function FakeCheckoutPage({
  searchParams,
}: PageProps<"/[locale]/checkout/fake">) {
  if (!configuredProviders().has("fake")) notFound();
  const user = await requireCustomer();
  const { reference } = await searchParams;
  const value = typeof reference === "string" ? reference : "";
  const decoded = decodeFakeReference(serverEnv().BETTER_AUTH_SECRET, value);
  const order = decoded
    ? await getDb().order.findFirst({
        where: { id: decoded.o, userId: user.id, providerReference: value },
      })
    : null;
  if (!decoded || !order) notFound();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("checkout.fake")]);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <p className="text-lg">
        {t("amount")}: <MoneyText locale={locale} amountMinor={decoded.a} currency={decoded.c} />
      </p>
      <FakeCheckout reference={value} />
    </section>
  );
}
