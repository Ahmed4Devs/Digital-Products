import type { ProductDetail } from "@/features/products/types";
import { appUrl, publicImageUrl } from "@/lib/env/public";
import { toDecimalString } from "@/lib/money";

type ProductJsonLdProps = {
  product: ProductDetail;
  name: string;
  description: string;
  path: string;
};

/**
 * schema.org Product data for search engines. It is inert JSON (not executed), and `<`
 * is escaped so no value can close the script element.
 */
export function ProductJsonLd({ product, name, description, path }: ProductJsonLdProps) {
  const url = new URL(path, appUrl()).toString();
  const images = [product.cover, ...product.gallery]
    .map((image) => (image ? publicImageUrl(image.storageKey) : null))
    .filter((image): image is string => image !== null);

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    sku: product.id,
    url,
    ...(images.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      price: toDecimalString(product.priceUsdCents, "USD"),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url,
    },
  };

  return (
    <script
      type="application/ld+json"
      // Safe: serialized data with `<` escaped, never markup.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
