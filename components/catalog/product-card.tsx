import { productHref } from "@/lib/seo/paths";
import { getLocale } from "next-intl/server";
import { EmojiText } from "@/components/shared/emoji-text";
import { PriceDisplay } from "@/components/shared/price-display";
import type { ProductSummary } from "@/features/products/types";
import { Link } from "@/i18n/navigation";
import { localized } from "@/lib/text";
import { ProductImage } from "./product-image";

type ProductCardProps = {
  product: ProductSummary;
  usdToSarRate: string;
  /** h2 when the list sits directly under the page's h1, h3 under a section heading. */
  headingLevel?: 2 | 3;
};

export async function ProductCard({ product, usdToSarRate, headingLevel = 3 }: ProductCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const locale = await getLocale();
  const title = localized(locale, { ar: product.titleAr, en: product.titleEn });
  const category = product.category
    ? localized(locale, { ar: product.category.nameAr, en: product.category.nameEn })
    : null;

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md">
      <ProductImage
        image={product.cover}
        title={title}
        locale={locale}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        {category ? <p className="text-xs font-medium text-muted-foreground">{category}</p> : null}
        <Heading className="font-semibold leading-snug">
          {/* The stretched link makes the whole card clickable with one tab stop. */}
          <Link
            href={productHref(product.slug)}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            <EmojiText text={title} />
          </Link>
        </Heading>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          <EmojiText
            text={localized(locale, {
              ar: product.shortDescriptionAr,
              en: product.shortDescriptionEn,
            })}
          />
        </p>
        <PriceDisplay
          className="mt-auto pt-2"
          priceUsdCents={product.priceUsdCents}
          fixedPriceSarHalalas={product.fixedPriceSarHalalas}
          compareAtPriceUsdCents={product.compareAtPriceUsdCents}
          usdToSarRate={usdToSarRate}
        />
      </div>
    </article>
  );
}
