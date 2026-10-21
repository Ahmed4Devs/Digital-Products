import { getTranslations } from "next-intl/server";
import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import { getStoreBranding } from "@/features/settings/branding";
import { LEGAL_SLUGS, legalHref, type LegalSlug } from "@/features/settings/legal";
import { Link } from "@/i18n/navigation";

/** Cached so the footer stays part of the static shell; refreshed daily for the year. */
async function getCopyrightDate(): Promise<Date> {
  "use cache";
  cacheLife("days");
  return new Date();
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </a>
  );
}

export async function SiteFooter() {
  const [t, date, branding] = await Promise.all([
    getTranslations("common"),
    getCopyrightDate(),
    getStoreBranding(),
  ]);

  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <nav aria-label={t("footer.legal")}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {(Object.keys(LEGAL_SLUGS) as LegalSlug[]).map((slug) => (
              <li key={slug}>
                <Link
                  href={legalHref(slug)}
                  className="underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t(`footer.links.${slug}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>{t("footer.copyright", { date, storeName: branding.name })}</p>
        <p>
          {t.rich("footer.twemoji", {
            twemoji: (chunks) => (
              <ExternalLink href="https://github.com/jdecked/twemoji">{chunks}</ExternalLink>
            ),
            license: (chunks) => (
              <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">
                {chunks}
              </ExternalLink>
            ),
          })}
        </p>
      </div>
    </footer>
  );
}
