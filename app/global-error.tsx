"use client";

import arCommon from "@/messages/ar/common.json";
import enCommon from "@/messages/en/common.json";
import "./globals.css";

// Replaces a root layout that failed to render, so there is no locale, provider or
// shell: the message is shown in both languages, from the same translation files.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const pages = [
    { lang: "ar", dir: "rtl", text: arCommon.errorPage },
    { lang: "en", dir: "ltr", text: enCommon.errorPage },
  ] as const;
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-full flex-col items-center justify-center gap-10 bg-background p-6 text-foreground">
        <title>{`${arCommon.errorPage.title} · ${enCommon.errorPage.title}`}</title>
        {pages.map(({ lang, dir, text }) => (
          <section
            key={lang}
            lang={lang}
            dir={dir}
            className="flex max-w-xl flex-col items-center gap-3 text-center"
          >
            <h1 className="text-2xl font-semibold">{text.title}</h1>
            <p className="text-muted-foreground">{text.description}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => retry()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {text.retry}
              </button>
              <a
                href={`/${lang}`}
                className="rounded-lg border px-4 py-2 text-sm font-medium underline-offset-4 hover:underline"
              >
                {text.home}
              </a>
            </div>
          </section>
        ))}
      </body>
    </html>
  );
}
