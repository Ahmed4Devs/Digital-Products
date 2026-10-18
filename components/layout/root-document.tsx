import { DirectionProvider } from "@base-ui/react/direction-provider";
import { NextIntlClientProvider, type Locale } from "next-intl";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";
import { formats, TIME_ZONE } from "@/i18n/formats";
import { getDirection } from "@/i18n/locale";
import { cn } from "@/lib/utils";

// Covers both Arabic and Latin, so one self-hosted family serves both locales.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

type RootDocumentProps = {
  locale: Locale;
  /**
   * Per-request CSP nonce. Only the dynamic, nonce-protected route group introduced in
   * Phase 9 passes one (spec §17.5 §2); statically rendered routes never do.
   */
  nonce?: string;
  children: ReactNode;
};

/** The `<html>` shell shared by every root layout: language, direction, font, providers. */
export async function RootDocument({ locale, nonce, children }: RootDocumentProps) {
  const direction = getDirection(locale);
  const messages = await getMessages();

  return (
    // next-themes sets the theme class before hydration, so the attribute differs by design.
    <html
      lang={locale}
      dir={direction}
      className={cn("h-full font-sans antialiased", plexArabic.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* Only the namespaces client components need are serialized to the browser. */}
        <NextIntlClientProvider
          locale={locale}
          messages={{ common: messages.common }}
          formats={formats}
          timeZone={TIME_ZONE}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            nonce={nonce}
          >
            <DirectionProvider direction={direction}>{children}</DirectionProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
