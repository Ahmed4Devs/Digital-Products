import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OrderStatus } from "@/components/checkout/order-status";
import { requireCustomer } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.result");
  return { title: t("metadataTitle") };
}

export default async function CheckoutResultPage({
  searchParams,
}: PageProps<"/[locale]/checkout/result">) {
  const user = await requireCustomer({ next: "/account/library" });
  const { order: orderParam } = await searchParams;
  const orderId = z.uuid().safeParse(Array.isArray(orderParam) ? orderParam[0] : orderParam);
  if (!orderId.success) notFound();

  const order = await getDb().order.findFirst({
    where: { id: orderId.data, userId: user.id },
    select: { id: true, orderNumber: true, status: true, provider: true },
  });
  if (!order) notFound();
  const [t, format] = await Promise.all([getTranslations("checkout.result"), getFormatter()]);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("order", {
            number: format.number(order.orderNumber, {
              numberingSystem: "latn",
              useGrouping: false,
            }),
          })}
        </p>
      </div>
      <OrderStatus
        orderId={order.id}
        initialStatus={order.status}
        capturePayPal={order.provider === "paypal"}
      />
    </section>
  );
}
