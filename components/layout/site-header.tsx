import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { AccountLink } from "./account-link";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader() {
  const t = await getTranslations("common");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Logo className="size-7 text-primary" />
            <span>{t("storeName")}</span>
          </Link>
          <nav aria-label={t("nav.primary")}>
            <Link href="/products" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("nav.products")}
            </Link>
          </nav>
        </div>
        {/* Personal UI is resolved in the browser so pages stay static; the cart count
            joins the account link in Phase 6. */}
        <div className="flex items-center gap-1">
          <AccountLink />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
