import type { ProductSummary } from "@/features/products/types";
import { ProductCard } from "./product-card";

export function ProductGrid({
  products,
  usdToSarRate,
  headingLevel,
}: {
  products: ProductSummary[];
  usdToSarRate: string;
  headingLevel?: 2 | 3;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="flex">
          <ProductCard product={product} usdToSarRate={usdToSarRate} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
