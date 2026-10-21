import type { ProductSummary } from "@/features/products/types";
import { ProductCard } from "./product-card";

export function ProductGrid({
  products,
  usdToSarRate,
}: {
  products: ProductSummary[];
  usdToSarRate: string;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="flex">
          <ProductCard product={product} usdToSarRate={usdToSarRate} />
        </li>
      ))}
    </ul>
  );
}
