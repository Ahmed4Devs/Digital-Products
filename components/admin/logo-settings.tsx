"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { removeLogoAction } from "@/features/settings/actions";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { ACCEPTED_EXTENSIONS, MAX_IMAGE_BYTES } from "@/lib/storage/policy";
import { ActionFeedback } from "./action-feedback";
import { useFileSize } from "./format";
import { UploadButton, UploadStatus } from "./upload-button";
import { useUpload } from "./use-upload";

type Variant = "light" | "dark";

function LogoSlot({ variant, url }: { variant: Variant; url: string | null }) {
  const t = useTranslations("admin.logos");
  const router = useRouter();
  const { phase, busy, upload } = useUpload();
  const [state, setState] = useState<ActionState>(IDLE);
  const [removing, startRemoving] = useTransition();

  async function onFile(file: File) {
    const result = await upload(file, { kind: "logo", variant });
    setState(result);
    if (result.status === "success") router.refresh();
  }

  function remove() {
    startRemoving(async () => {
      const result = await removeLogoAction(variant);
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  const label = t(variant);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="font-medium">{label}</h3>
      <div
        className={
          variant === "dark"
            ? "flex h-24 items-center justify-center rounded-md bg-neutral-900 p-3"
            : "flex h-24 items-center justify-center rounded-md bg-white p-3"
        }
      >
        {url ? (
          // Any aspect ratio, straight from the public bucket; the box only reserves space.
          <Image
            src={url}
            alt={t("preview", { variant: label })}
            width={240}
            height={72}
            unoptimized
            className="h-full w-auto max-w-full object-contain"
          />
        ) : (
          <span
            className={variant === "dark" ? "text-sm text-neutral-300" : "text-sm text-neutral-600"}
          >
            {t("none")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <UploadButton
          label={url ? t("replace") : t("upload")}
          accept={ACCEPTED_EXTENSIONS[variant === "light" ? "logoLight" : "logoDark"]}
          disabled={busy || removing}
          onFile={onFile}
        />
        {url ? (
          <Button type="button" variant="outline" disabled={busy || removing} onClick={remove}>
            <Trash2Icon aria-hidden="true" />
            {t("remove")}
          </Button>
        ) : null}
      </div>
      <UploadStatus phase={phase} />
      <ActionFeedback state={state} />
    </div>
  );
}

/** Light and dark logos; without them the header shows the store name. */
export function LogoSettings({ light, dark }: { light: string | null; dark: string | null }) {
  const t = useTranslations("admin.logos");
  const fileSize = useFileSize();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t("hint", { size: fileSize(MAX_IMAGE_BYTES) })}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <LogoSlot variant="light" url={light} />
        <LogoSlot variant="dark" url={dark} />
      </div>
    </div>
  );
}
