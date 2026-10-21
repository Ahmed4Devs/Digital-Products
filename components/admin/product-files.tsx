"use client";

import { FileIcon, Trash2Icon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { removeProductFileAction } from "@/features/products/actions";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from "@/lib/storage/policy";
import { ActionFeedback } from "./action-feedback";
import { ConfirmButton } from "./confirm-button";
import { useFileSize } from "./format";
import { UploadButton, UploadStatus } from "./upload-button";
import { useUpload } from "./use-upload";

export type AdminFile = {
  id: string;
  fileName: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
  supersededAt: string | null;
  downloadCount: number;
};

function FileDetails({ file }: { file: AdminFile }) {
  const t = useTranslations("admin.files");
  const fileSize = useFileSize();
  const format = useFormatter();
  return (
    <div className="flex min-w-0 items-start gap-3">
      <FileIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate font-medium">
          <bdi>{file.fileName}</bdi>
        </p>
        <p className="text-sm text-muted-foreground">
          {[
            t("version", { version: file.version }),
            fileSize(file.sizeBytes),
            t("downloads", { count: file.downloadCount }),
            file.supersededAt
              ? t("replacedOn", { date: format.dateTime(new Date(file.supersededAt), "dateTime") })
              : format.dateTime(new Date(file.createdAt), "dateTime"),
          ].join(" · ")}
        </p>
      </div>
    </div>
  );
}

/** Downloadable files with version history (spec §17.5 §8). */
export function ProductFiles({ productId, files }: { productId: string; files: AdminFile[] }) {
  const t = useTranslations("admin.files");
  const fileSize = useFileSize();
  const router = useRouter();
  const { phase, busy, upload } = useUpload();
  const [state, setState] = useState<ActionState>(IDLE);
  const [removing, startRemoving] = useTransition();

  const active = files.filter((file) => file.supersededAt === null);
  const history = files.filter((file) => file.supersededAt !== null);
  const disabled = busy || removing;

  async function onFile(file: File, replacesFileId: string | null = null) {
    const result = await upload(file, {
      kind: "product",
      productId,
      purpose: "file",
      replacesFileId,
    });
    setState(result);
    if (result.status === "success") router.refresh();
  }

  function remove(fileId: string) {
    startRemoving(async () => {
      setState(await removeProductFileAction(productId, fileId));
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="files-heading"
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
    >
      <div>
        <h2 id="files-heading" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <p className="text-sm text-muted-foreground">
          {t("accepted", { size: fileSize(MAX_FILE_BYTES) })}
        </p>
      </div>

      {active.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {active.map((file) => (
            <li
              key={file.id}
              className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <FileDetails file={file} />
              <div className="flex shrink-0 flex-wrap gap-2">
                <UploadButton
                  label={t("newVersion")}
                  accept={ACCEPTED_EXTENSIONS.file}
                  disabled={disabled}
                  onFile={(selected) => onFile(selected, file.id)}
                />
                <ConfirmButton
                  title={t("removeTitle")}
                  description={t("removeDescription")}
                  confirmLabel={t("confirmRemove")}
                  cancelLabel={t("cancel")}
                  disabled={disabled}
                  onConfirm={() => remove(file.id)}
                >
                  <Trash2Icon aria-hidden="true" />
                  {t("remove")}
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}

      <div>
        <UploadButton
          label={t("add")}
          accept={ACCEPTED_EXTENSIONS.file}
          variant="default"
          disabled={disabled}
          onFile={(file) => onFile(file)}
        />
      </div>
      <UploadStatus phase={phase} />
      <ActionFeedback state={state} />

      {history.length > 0 ? (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">{t("history")}</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {history.map((file) => (
              <li key={file.id}>
                <FileDetails file={file} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
