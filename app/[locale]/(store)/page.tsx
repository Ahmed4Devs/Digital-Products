import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmojiText } from "@/components/shared/emoji-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("store.home");
  return { title: t("metadataTitle") };
}

// Placeholder hero; featured products, newest products and categories arrive in Phase 4.
export default async function HomePage() {
  const t = await getTranslations("store.home");

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
      <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        <EmojiText text={t("title")} />
      </h1>
      <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
        <EmojiText text={t("tagline")} />
      </p>
    </section>
  );
}
