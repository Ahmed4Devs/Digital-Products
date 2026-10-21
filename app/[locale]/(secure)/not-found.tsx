import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotFoundContent } from "@/components/errors/not-found-content";
import { SiteShell } from "@/components/layout/site-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.notFound");
  return { title: t("metadataTitle") };
}

// The secure layout has no shell of its own (the account and admin add theirs).
export default function SecureNotFound() {
  return (
    <SiteShell>
      <NotFoundContent />
    </SiteShell>
  );
}
