import type { Metadata } from "next";
import type { ReactNode } from "react";

// The admin is never indexed and never linked from the storefront (spec §11).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
