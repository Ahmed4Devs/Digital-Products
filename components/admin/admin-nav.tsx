"use client";

import {
  FolderTreeIcon,
  LayoutDashboardIcon,
  PackageIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  SettingsIcon,
  TicketPercentIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", key: "overview", icon: LayoutDashboardIcon },
  { href: "/admin/products", key: "products", icon: PackageIcon },
  { href: "/admin/categories", key: "categories", icon: FolderTreeIcon },
  { href: "/admin/orders", key: "orders", icon: ReceiptTextIcon },
  { href: "/admin/customers", key: "customers", icon: UsersIcon },
  { href: "/admin/coupons", key: "coupons", icon: TicketPercentIcon },
  { href: "/admin/settings", key: "settings", icon: SettingsIcon },
  { href: "/admin/audit", key: "audit", icon: ScrollTextIcon },
] as const;

/** Dashboard navigation; the current section is marked for assistive technology. */
export function AdminNav() {
  const t = useTranslations("admin.shell");
  const pathname = usePathname();

  return (
    <nav aria-label={t("navLabel")}>
      <ul className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const current = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  current ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {t(`nav.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
