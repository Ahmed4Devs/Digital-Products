"use client";

import {
  ArchiveIcon,
  EyeIcon,
  ExternalLinkIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { productHref } from "@/lib/seo/paths";
import { Button, buttonVariants } from "@/components/ui/button";
import { changeProductStatusAction, deleteProductAction } from "@/features/products/actions";
import { Link, useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { ActionFeedback } from "./action-feedback";
import { ConfirmButton } from "./confirm-button";
import { ProductStatusBadge } from "./status-badge";

type ProductLifecycleProps = {
  productId: string;
  slug: string;
  status: "draft" | "published" | "archived";
  salesCount: number;
};

/** Publish, archive, move back to draft, delete, and preview (spec §11). */
export function ProductLifecycle({ productId, slug, status, salesCount }: ProductLifecycleProps) {
  const t = useTranslations("admin.lifecycle");
  const tStatus = useTranslations("admin.status");
  const router = useRouter();
  const [state, setState] = useState<ActionState>(IDLE);
  const [pending, startTransition] = useTransition();

  function change(target: "published" | "archived" | "draft") {
    startTransition(async () => {
      setState(await changeProductStatusAction(productId, target));
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteProductAction(productId);
      setState(result);
      if (result.status === "success") router.push("/admin/products");
    });
  }

  return (
    <section
      aria-labelledby="status-heading"
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="status-heading" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="flex items-center gap-2 text-sm">
          <span className="sr-only">{t("current", { status: tStatus(status) })}</span>
          <ProductStatusBadge status={status} />
          <span className="text-muted-foreground">{t("sales", { count: salesCount })}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {status !== "published" ? (
          <Button type="button" disabled={pending} onClick={() => change("published")}>
            <SendIcon aria-hidden="true" className="rtl:-scale-x-100" />
            {t("publish")}
          </Button>
        ) : null}
        {status === "published" ? (
          <ConfirmButton
            variant="outline"
            title={t("archiveTitle")}
            description={t("archiveDescription")}
            confirmLabel={t("confirmArchive")}
            cancelLabel={t("cancel")}
            disabled={pending}
            onConfirm={() => change("archived")}
          >
            <ArchiveIcon aria-hidden="true" />
            {t("archive")}
          </ConfirmButton>
        ) : null}
        {status !== "draft" && salesCount === 0 ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => change("draft")}
          >
            <Undo2Icon aria-hidden="true" className="rtl:-scale-x-100" />
            {t("unpublish")}
          </Button>
        ) : null}
        <Link
          href={`/admin/products/${productId}/preview`}
          className={buttonVariants({ variant: "outline" })}
        >
          <EyeIcon aria-hidden="true" />
          {t("preview")}
        </Link>
        {status === "published" ? (
          <Link
            href={productHref(slug)}
            target="_blank"
            className={buttonVariants({ variant: "outline" })}
          >
            <ExternalLinkIcon aria-hidden="true" className="rtl:-scale-x-100" />
            {t("viewInStore")}
          </Link>
        ) : null}
        {status === "draft" && salesCount === 0 ? (
          <ConfirmButton
            title={t("deleteTitle")}
            description={t("deleteDescription")}
            confirmLabel={t("confirmDelete")}
            cancelLabel={t("cancel")}
            disabled={pending}
            onConfirm={remove}
          >
            <Trash2Icon aria-hidden="true" />
            {t("delete")}
          </ConfirmButton>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {status === "published" ? t("archiveHint") : t("publishHint")}
      </p>
      <ActionFeedback state={state} />
    </section>
  );
}
