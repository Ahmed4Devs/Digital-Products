import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PaddleCheckout } from "@/components/checkout/paddle-checkout";
import { requireCustomer } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.paddle");
  return { title: t("title") };
}

export default async function PaddleCheckoutPage({
  searchParams,
}: PageProps<"/[locale]/checkout/paddle">) {
  const env = serverEnv();
  if (!env.PADDLE_CLIENT_TOKEN) notFound();
  const user = await requireCustomer();
  const params = await searchParams;
  const transactionId = z
    .string()
    .regex(/^txn_[a-z0-9]+$/)
    .safeParse(params._ptxn);
  const orderId = z.uuid().safeParse(params.order);
  if (!transactionId.success || !orderId.success) notFound();

  const order = await getDb().order.findFirst({
    where: {
      id: orderId.data,
      userId: user.id,
      provider: "paddle",
      providerReference: transactionId.data,
      status: "pending",
    },
    select: { id: true },
  });
  if (!order) notFound();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("checkout.paddle")]);
  const successUrl = new URL(`/${locale}/checkout/result`, env.APP_URL);
  successUrl.searchParams.set("order", order.id);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <PaddleCheckout
        clientToken={env.PADDLE_CLIENT_TOKEN}
        sandbox={env.PADDLE_ENVIRONMENT === "sandbox"}
        transactionId={transactionId.data}
        email={user.email}
        locale={locale}
        successUrl={successUrl.toString()}
      />
    </section>
  );
}
