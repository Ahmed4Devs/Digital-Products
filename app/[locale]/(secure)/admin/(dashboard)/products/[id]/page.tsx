import type { Metadata } from "next";
import { ChevronLeftIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FormAlert } from "@/components/auth/form-alert";
import { ProductFiles } from "@/components/admin/product-files";
import { ProductForm } from "@/components/admin/product-form";
import { ProductLifecycle } from "@/components/admin/product-lifecycle";
import { ProductMedia, type AdminImage } from "@/components/admin/product-media";
import { buttonVariants } from "@/components/ui/button";
import {
  findCategoryOptions,
  findProductForEdit,
  type ProductForEdit,
} from "@/features/products/admin-data";
import { MAX_GALLERY_IMAGES } from "@/features/products/uploads";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { publicImageUrl } from "@/lib/env/public";
import { localized } from "@/lib/text";
import { productFormDefaults } from "../form-defaults";

async function loadProduct(params: Promise<{ id: string }>) {
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();
  const product = await findProductForEdit(getDb(), parsed.data);
  if (!product) notFound();
  return product;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.productForm");
  return { title: t("editTitle") };
}

function toAdminImage(image: ProductForEdit["gallery"][number]): AdminImage {
  return {
    id: image.id,
    url: publicImageUrl(image.storageKey),
    width: image.width,
    height: image.height,
    altAr: image.altAr,
    altEn: image.altEn,
  };
}

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/products/[id]">) {
  await requireOwner();
  const [locale, t, product, categories, query] = await Promise.all([
    getLocale(),
    getTranslations("admin.productForm"),
    loadProduct(params),
    findCategoryOptions(getDb()),
    searchParams,
  ]);
  const title = localized(locale, { ar: product.titleAr, en: product.titleEn });

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/products"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
      >
        <ChevronLeftIcon aria-hidden="true" className="rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <div>
        <p className="text-sm text-muted-foreground">{t("editTitle")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      </div>
      {query.created ? <FormAlert tone="success">{t("createdNotice")}</FormAlert> : null}

      <ProductLifecycle
        productId={product.id}
        slug={product.slug}
        status={product.status}
        salesCount={product.salesCount}
      />
      <ProductFiles
        productId={product.id}
        files={product.files.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          sizeBytes: file.sizeBytes,
          version: file.version,
          createdAt: file.createdAt.toISOString(),
          supersededAt: file.supersededAt?.toISOString() ?? null,
          downloadCount: file.downloadCount,
        }))}
      />
      <ProductMedia
        productId={product.id}
        title={title}
        cover={product.cover ? toAdminImage(product.cover) : null}
        gallery={product.gallery.map(toAdminImage)}
        maxGallery={MAX_GALLERY_IMAGES}
      />
      <ProductForm
        key={product.updatedAt.toISOString()}
        productId={product.id}
        defaults={productFormDefaults(product)}
        categories={categories.map((category) => ({
          id: category.id,
          name: localized(locale, { ar: category.nameAr, en: category.nameEn }),
        }))}
      />
    </div>
  );
}
