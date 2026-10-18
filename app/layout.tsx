import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

// Covers both Arabic and Latin, so one family serves both locales.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

// Temporary Phase 1 root layout. Phase 2 moves `<html lang dir>` into app/[locale]/layout.tsx.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={cn("h-full font-sans antialiased", plexArabic.variable)}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
