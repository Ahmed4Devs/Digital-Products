"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/account", key: "overview" },
  { href: "/account/library", key: "library" },
  { href: "/account/orders", key: "orders" },
] as const;

/** Account sections, with the current one marked for assistive technology. */
export function AccountNav() {
  const t = useTranslations("account.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="mx-auto w-full max-w-4xl px-4 pt-8 sm:px-6">
      <ul className="flex gap-1 overflow-x-auto border-b">
        {ITEMS.map(({ href, key }) => {
          const current = pathname === href;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  current
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
