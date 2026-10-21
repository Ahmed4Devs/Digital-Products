"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Script from "next/script";
import { useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";

// Paddle's overlay checkout for a transaction the server created (spec §10.2). This
// page is the "default payment link" configured in Paddle. Paddle.js is loaded only
// here, from Paddle's CDN; the checkout routes' CSP allows it (Phase 9).

type PaddleGlobal = {
  Environment: { set(environment: "sandbox"): void };
  Initialize(options: { token: string; eventCallback?: (event: { name?: string }) => void }): void;
  Checkout: {
    open(options: {
      transactionId: string;
      customer?: { email: string };
      settings?: { displayMode?: "overlay"; locale?: string; successUrl?: string };
    }): void;
  };
};

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

export function PaddleCheckout(props: {
  clientToken: string;
  sandbox: boolean;
  transactionId: string;
  email: string;
  locale: "ar" | "en";
  successUrl: string;
}) {
  const t = useTranslations("checkout.paddle");
  const [failed, setFailed] = useState(false);

  function open() {
    const paddle = (window as unknown as { Paddle?: PaddleGlobal }).Paddle;
    if (!paddle) {
      setFailed(true);
      return;
    }
    if (props.sandbox) paddle.Environment.set("sandbox");
    paddle.Initialize({
      token: props.clientToken,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") window.location.assign(props.successUrl);
      },
    });
    paddle.Checkout.open({
      transactionId: props.transactionId,
      customer: { email: props.email },
      settings: { displayMode: "overlay", locale: props.locale, successUrl: props.successUrl },
    });
  }

  return (
    <>
      <Script
        src={PADDLE_JS}
        strategy="afterInteractive"
        onReady={open}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <FormAlert tone="error">{t("failed")}</FormAlert>
      ) : (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircleIcon aria-hidden="true" className="size-5 animate-spin" />
          {t("loading")}
        </p>
      )}
    </>
  );
}
