import type { Metadata } from "next";
import "./globals.css";

// Temporary Phase 1 root layout. Phase 2 moves `<html lang dir>` into app/[locale]/layout.tsx.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
