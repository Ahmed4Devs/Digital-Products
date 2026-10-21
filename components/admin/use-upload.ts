"use client";

import { useState } from "react";
import { confirmUploadAction, requestUploadAction } from "@/features/products/actions";
import type { ActionState } from "@/lib/actions";
import type { UploadPurpose } from "@/lib/storage/policy";

export type UploadPhase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "verifying" }
  | { kind: "done"; state: ActionState };

type UploadTarget = {
  productId: string;
  purpose: UploadPurpose;
  replacesFileId?: string | null;
};

/** PUT to the pre-signed URL with progress; XHR because fetch cannot report upload progress. */
function put(url: string, file: File, contentType: string, onProgress: (percent: number) => void) {
  return new Promise<boolean>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = () => resolve(false);
    request.send(file);
  });
}

/**
 * Owner upload flow (spec §17.5 §8): ask the server for a pre-signed URL, send the file
 * straight to storage, then ask the server to verify and record it.
 */
export function useUpload() {
  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });

  async function upload(
    file: File,
    target: UploadTarget,
    details: { altAr?: string; altEn?: string } = {},
  ): Promise<ActionState> {
    setPhase({ kind: "uploading", progress: 0 });
    const finish = (state: ActionState) => {
      setPhase({ kind: "done", state });
      return state;
    };

    const issued = await requestUploadAction({
      productId: target.productId,
      purpose: target.purpose,
      fileName: file.name,
      sizeBytes: file.size,
      replacesFileId: target.replacesFileId ?? null,
    });
    if (issued.status !== "success" || !issued.upload) return finish(issued);

    const stored = await put(issued.upload.url, file, issued.upload.contentType, (progress) =>
      setPhase({ kind: "uploading", progress }),
    );
    if (!stored) return finish({ status: "error", message: "uploadFailed" });

    setPhase({ kind: "verifying" });
    return finish(await confirmUploadAction({ token: issued.upload.token, ...details }));
  }

  const busy = phase.kind === "uploading" || phase.kind === "verifying";
  return { phase, busy, upload };
}
