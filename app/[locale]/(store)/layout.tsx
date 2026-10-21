import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { RootDocument } from "@/components/layout/root-document";
import { rootMetadata } from "@/components/layout/root-metadata";
import { SiteShell } from "@/components/layout/site-shell";
import { routing } from "@/i18n/routing";
import "../../globals.css";

// Root layout of the public storefront: statically prerendered per locale.
//
// The app has two root layouts. This one stays static (catalog pages must pass
// ensureStatic, spec §12); `(secure)` renders fully on demand for authentication, the
// account area and the admin (spec §17.5 §2). `[locale]` sits above both, so it is a
// root param that next-intl reads on the server.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export function generateMetadata(): Promise<Metadata> {
  return rootMetadata();
}

export default async function StoreRootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <RootDocument locale={locale}>
      <SiteShell>{children}</SiteShell>
    </RootDocument>
  );
}
