import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { RootDocument } from "@/components/layout/root-document";
import { rootMetadata } from "@/components/layout/root-metadata";
import { routing } from "@/i18n/routing";
import "../../globals.css";

// Root layout of everything that depends on who is asking: sign-in and sign-up, the
// account area and the admin (later also checkout). It waits for the request before
// rendering anything, so there is no prerendered shell: redirects and 404s from the
// guards below carry real HTTP status codes, and Phase 9 can add per-request CSP nonces
// here (spec §17.5 §2).
export const instant = false;

// Root params must be enumerated even though these pages render on demand.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export function generateMetadata(): Promise<Metadata> {
  return rootMetadata({ indexable: false });
}

export default async function SecureRootLayout({ children, params }: LayoutProps<"/[locale]">) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return <RootDocument locale={locale}>{children}</RootDocument>;
}
