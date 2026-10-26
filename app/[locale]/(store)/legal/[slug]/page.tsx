import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { LtrText } from "@/components/shared/ltr-text";
import { RICH_TEXT_CLASS, RichText } from "@/components/shared/rich-text";
import { getStoreBranding } from "@/features/settings/branding";
import { isLegalSlug, LEGAL_SLUGS, legalHref } from "@/features/settings/legal";
import { getLegalPage } from "@/features/settings/queries";
import { pageMetadata } from "@/lib/seo/metadata";
import { localized } from "@/lib/text";

// Terms, privacy, refund policy, about and contact (spec §8.1): the owner's text from
// settings, else a translated placeholder. Prerendered per locale and refreshed by the
// settings tag when the owner saves a page.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return Object.keys(LEGAL_SLUGS).map((slug) => ({ slug }));
}

async function resolve(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return isLegalSlug(slug) ? slug : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/[slug]">): Promise<Metadata> {
  const [locale, slug, t, branding] = await Promise.all([
    getLocale(),
    resolve(params),
    getTranslations("store.legal.pages"),
    getStoreBranding(),
  ]);
  if (!slug) return {};
  const page = LEGAL_SLUGS[slug];
  return pageMetadata({
    locale,
    path: legalHref(slug),
    title: t(`${page}.title`),
    description: t(`${page}.description`),
    siteName: branding.name,
  });
}

const placeholderTags = {
  h2: (chunks: ReactNode) => <h2>{chunks}</h2>,
  p: (chunks: ReactNode) => <p>{chunks}</p>,
  ul: (chunks: ReactNode) => <ul>{chunks}</ul>,
  li: (chunks: ReactNode) => <li>{chunks}</li>,
};

// The App Shell is shared by every legal page, so the slug is read inside <Suspense>.
export default function LegalPage({ params }: PageProps<"/[locale]/legal/[slug]">) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <Suspense fallback={<LegalSkeleton />}>
        <LegalContent params={params} />
      </Suspense>
    </article>
  );
}

async function LegalContent({ params }: Pick<PageProps<"/[locale]/legal/[slug]">, "params">) {
  const [locale, slug, t] = await Promise.all([
    getLocale(),
    resolve(params),
    getTranslations("store.legal"),
  ]);
  if (!slug) notFound();
  const page = LEGAL_SLUGS[slug];
  const content = await getLegalPage(page);
  const html = localized(locale, { ar: content.ar, en: content.en });
  const title = t(`pages.${page}.title`);

  return (
    <>
      <Breadcrumbs
        label={t("breadcrumb")}
        items={[{ label: t("home"), href: "/" }, { label: title }]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {html ? (
        <RichText html={html} />
      ) : (
        <>
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {t("placeholderNotice")}
          </p>
          <div className={RICH_TEXT_CLASS}>{t.rich(`pages.${page}.body`, placeholderTags)}</div>
        </>
      )}
      {slug === "contact" && content.supportEmail ? (
        <p>
          {t.rich("supportEmail", {
            email: () => (
              <a
                href={`mailto:${content.supportEmail}`}
                className="text-primary underline underline-offset-4"
              >
                <LtrText>{content.supportEmail}</LtrText>
              </a>
            ),
          })}
        </p>
      ) : null}
    </>
  );
}

function LegalSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="h-5 w-40 rounded bg-muted" />
      <div className="h-9 w-2/3 rounded-lg bg-muted" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-4 rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
