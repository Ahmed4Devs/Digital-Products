import { getTranslations } from "next-intl/server";
import { cacheLife } from "next/cache";
import type { ReactNode } from "react";

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
  const t = await getTranslations("common");
  const date = await getCopyrightDate();

  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>{t("footer.copyright", { date, storeName: t("storeName") })}</p>
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
