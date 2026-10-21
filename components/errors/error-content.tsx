"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The translated body of the error boundaries. Server errors arrive with a generic
 * message and a digest only (never internals, spec §5.1); the digest is shown so a
 * customer can quote it and the owner can find the server log line.
 */
export function ErrorContent({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("common.errorPage");
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6"
    >
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>
          {t("retry")}
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          {t("home")}
        </Link>
      </div>
      {digest ? (
        <p className="text-xs text-muted-foreground">
          <bdi dir="ltr">{t("reference", { digest })}</bdi>
        </p>
      ) : null}
    </section>
  );
}
