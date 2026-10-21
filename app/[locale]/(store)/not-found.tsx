import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotFoundContent } from "@/components/errors/not-found-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.notFound");
  return { title: t("metadataTitle") };
}

// Inside the store layout, so the header and footer stay available.
export default function StoreNotFound() {
  return <NotFoundContent />;
}
