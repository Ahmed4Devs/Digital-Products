import { PackageIcon } from "lucide-react";
import Image from "next/image";
import type { Locale } from "next-intl";
import type { CatalogImage } from "@/features/products/types";
import { publicImageUrl } from "@/lib/env/public";
import { localized } from "@/lib/text";
import { cn } from "@/lib/utils";

type ProductImageProps = {
  image: CatalogImage | null;
  /** Used as alt text when the image has none. */
  title: string;
  locale: Locale;
  sizes: string;
  /** Only the LCP image of a page is preloaded (spec §12). */
  preload?: boolean;
  className?: string;
};

/**
 * A product image from the public bucket through next/image (AVIF/WebP, responsive
 * sizes), or a neutral placeholder when the product has no image yet.
 */
export function ProductImage({
  image,
  title,
  locale,
  sizes,
  preload,
  className,
}: ProductImageProps) {
  const src = image ? publicImageUrl(image.storageKey) : null;

  if (!image || !src) {
    return (
      <div
        className={cn(
          "flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-primary/15 to-muted",
          className,
        )}
      >
        <PackageIcon aria-hidden="true" className="size-12 text-primary/60" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={localized(locale, { ar: image.altAr, en: image.altEn }) || title}
      width={image.width}
      height={image.height}
      sizes={sizes}
      preload={preload}
      className={cn("aspect-[4/3] h-auto w-full object-cover", className)}
    />
  );
}
