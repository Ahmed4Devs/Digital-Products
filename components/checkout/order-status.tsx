"use client";

import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { capturePayPalAction, clearPurchasedFromCartAction } from "@/features/checkout/actions";
import { Link, useRouter } from "@/i18n/navigation";
import { announceCartChange } from "@/components/cart/cart-events";

type Status = "pending" | "paid" | "failed" | "refunded" | "expired";

const POLL_MS = 2_000;
/** After this the page stops polling and explains that confirmation can take longer. */
const GIVE_UP_MS = 2 * 60_000;

/**
 * Shows "processing" and polls the order (spec §10.1 step 7). It never changes the order:
 * only verified webhooks do. Once paid, it opens My Purchases.
 */
export function OrderStatus({
  orderId,
  initialStatus,
  capturePayPal,
}: {
  orderId: string;
  initialStatus: Status;
  capturePayPal: boolean;
}) {
  const t = useTranslations("checkout.result");
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [waitingLong, setWaitingLong] = useState(false);
  const captured = useRef(false);

  useEffect(() => {
    if (status !== "pending") return;
    if (capturePayPal && !captured.current) {
      captured.current = true;
      void capturePayPalAction(orderId);
    }
    const started = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - started > GIVE_UP_MS) {
        window.clearInterval(timer);
        setWaitingLong(true);
        return;
      }
      const response = await fetch(`/api/orders/${orderId}/status`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { status: Status };
      if (body.status !== "pending") {
        window.clearInterval(timer);
        setStatus(body.status);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [status, orderId, capturePayPal]);

  useEffect(() => {
    if (status !== "paid") return;
    void clearPurchasedFromCartAction(orderId).then(() => {
      announceCartChange();
      router.replace("/account/library");
    });
  }, [status, orderId, router]);

  if (status === "pending") {
    return (
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        <LoaderCircleIcon aria-hidden="true" className="size-10 animate-spin text-primary" />
        <p>{waitingLong ? t("stillWaiting") : t("processing")}</p>
        {waitingLong ? (
          <Link href="/account/library" className={buttonVariants({ variant: "outline" })}>
            {t("library")}
          </Link>
        ) : null}
      </div>
    );
  }
  if (status === "paid") {
    return (
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        <CircleCheckIcon aria-hidden="true" className="size-10 text-primary" />
        <p>{t("paid")}</p>
        <Link href="/account/library" className={buttonVariants()}>
          {t("library")}
        </Link>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-center gap-4 text-center">
      <CircleAlertIcon aria-hidden="true" className="size-10 text-destructive" />
      <p>{t(status)}</p>
      <Link href="/cart" className={buttonVariants({ variant: "outline" })}>
        {t("retry")}
      </Link>
    </div>
  );
}
