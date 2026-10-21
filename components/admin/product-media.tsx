"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeProductImageAction } from "@/features/products/actions";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { ACCEPTED_EXTENSIONS, MAX_IMAGE_BYTES } from "@/lib/storage/policy";
import { ActionFeedback } from "./action-feedback";
import { useFileSize } from "./format";
import { UploadButton, UploadStatus } from "./upload-button";
import { useUpload } from "./use-upload";

export type AdminImage = {
  id: string;
  url: string | null;
  width: number;
  height: number;
  altAr: string;
  altEn: string;
};

type ProductMediaProps = {
  productId: string;
  title: string;
  cover: AdminImage | null;
  gallery: AdminImage[];
  maxGallery: number;
};

function Thumbnail({ image, alt }: { image: AdminImage; alt: string }) {
  if (!image.url) return null;
  return (
    // Owner previews come straight from the public bucket; no optimization needed.
    <Image
      src={image.url}
      alt={alt}
      width={image.width}
      height={image.height}
      unoptimized
      className="aspect-[4/3] w-full rounded-lg border bg-muted object-cover"
    />
  );
}

/** Cover and gallery images: uploads go straight to storage, then the server verifies them. */
export function ProductMedia({ productId, title, cover, gallery, maxGallery }: ProductMediaProps) {
  const t = useTranslations("admin.media");
  const fileSize = useFileSize();
  const router = useRouter();
  const { phase, busy, upload } = useUpload();
  const [state, setState] = useState<ActionState>(IDLE);
  const [removing, startRemoving] = useTransition();
  const [altAr, setAltAr] = useState("");
  const [altEn, setAltEn] = useState("");

  async function onFile(file: File, purpose: "cover" | "gallery") {
    const result = await upload(file, { kind: "product", productId, purpose }, { altAr, altEn });
    setState(result);
    if (result.status === "success") {
      setAltAr("");
      setAltEn("");
      router.refresh();
    }
  }

  function remove(imageId: string) {
    startRemoving(async () => {
      setState(await removeProductImageAction(productId, imageId));
      router.refresh();
    });
  }

  const disabled = busy || removing;

  return (
    <section
      aria-labelledby="media-heading"
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
    >
      <div>
        <h2 id="media-heading" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("accepted", { size: fileSize(MAX_IMAGE_BYTES) })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="image-alt-ar">{t("altAr")}</Label>
          <Input
            id="image-alt-ar"
            dir="rtl"
            lang="ar"
            value={altAr}
            onChange={(e) => setAltAr(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="image-alt-en">{t("altEn")}</Label>
          <Input
            id="image-alt-en"
            dir="ltr"
            lang="en"
            value={altEn}
            onChange={(e) => setAltEn(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{t("cover")}</h3>
        {cover ? (
          <div className="flex max-w-xs flex-col gap-2">
            <Thumbnail image={cover} alt={cover.altAr || cover.altEn || title} />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="self-start"
              disabled={disabled}
              onClick={() => remove(cover.id)}
            >
              <Trash2Icon aria-hidden="true" />
              {t("remove")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noCover")}</p>
        )}
        <div>
          <UploadButton
            label={cover ? t("replaceCover") : t("uploadCover")}
            accept={ACCEPTED_EXTENSIONS.cover}
            disabled={disabled}
            onFile={(file) => onFile(file, "cover")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="font-medium">{t("gallery")}</h3>
          <p className="text-sm text-muted-foreground">{t("galleryHint", { max: maxGallery })}</p>
        </div>
        {gallery.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {gallery.map((image, index) => (
              <li key={image.id} className="flex flex-col gap-2">
                <Thumbnail
                  image={image}
                  alt={image.altAr || image.altEn || `${title} ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={disabled}
                  onClick={() => remove(image.id)}
                >
                  <Trash2Icon aria-hidden="true" />
                  {t("remove")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noGallery")}</p>
        )}
        {gallery.length < maxGallery ? (
          <div>
            <UploadButton
              label={t("addImage")}
              accept={ACCEPTED_EXTENSIONS.gallery}
              disabled={disabled}
              onFile={(file) => onFile(file, "gallery")}
            />
          </div>
        ) : null}
      </div>

      <UploadStatus phase={phase} />
      <ActionFeedback state={state} />
    </section>
  );
}
