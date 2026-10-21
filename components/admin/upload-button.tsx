"use client";

import { UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ChangeEvent } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploadPhase } from "./use-upload";

type UploadButtonProps = {
  label: string;
  accept: string[];
  disabled?: boolean;
  onFile: (file: File) => void;
  variant?: "default" | "outline";
};

/**
 * A file picker that looks like a button. The real input stays focusable (visually
 * hidden), so keyboard and screen-reader users reach it like any other control.
 */
export function UploadButton({
  label,
  accept,
  disabled,
  onFile,
  variant = "outline",
}: UploadButtonProps) {
  const id = useId();

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) onFile(file);
  }

  return (
    <span className="inline-flex">
      <input
        id={id}
        type="file"
        className="peer sr-only"
        accept={accept.map((extension) => `.${extension}`).join(",")}
        disabled={disabled}
        onChange={onChange}
      />
      <label
        htmlFor={id}
        aria-disabled={disabled}
        className={cn(
          buttonVariants({ variant }),
          "cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        )}
      >
        <UploadIcon aria-hidden="true" />
        {label}
      </label>
    </span>
  );
}

/** Live progress of an upload, announced politely. */
export function UploadStatus({ phase }: { phase: UploadPhase }) {
  const t = useTranslations("admin.upload");
  if (phase.kind !== "uploading" && phase.kind !== "verifying") return null;
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
      {phase.kind === "uploading" ? (
        <>
          <progress
            max={100}
            value={phase.progress}
            className="h-2 w-40 accent-primary"
            aria-hidden="true"
          />
          {t("uploading", { progress: phase.progress / 100 })}
        </>
      ) : (
        t("verifying")
      )}
    </div>
  );
}
