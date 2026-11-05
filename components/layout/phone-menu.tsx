"use client";

import { MenuIcon, PackageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { PHONE_TARGET } from "./phone-target";
import { ThemeOptions } from "./theme-toggle";

const ITEM = "min-h-11";

/** What does not fit the header on a phone: the catalog, the language and the theme. */
export function PhoneMenu() {
  const t = useTranslations("common");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nav.menu")}
            title={t("nav.menu")}
            className={PHONE_TARGET}
          />
        }
      >
        <MenuIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLinkItem closeOnClick className={ITEM} render={<Link href="/products" />}>
          <PackageIcon aria-hidden="true" />
          {t("nav.products")}
        </DropdownMenuLinkItem>
        <LanguageSwitcher
          render={(link) => <DropdownMenuLinkItem closeOnClick className={ITEM} render={link} />}
        />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
          <ThemeOptions itemClassName={ITEM} closeOnClick />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
