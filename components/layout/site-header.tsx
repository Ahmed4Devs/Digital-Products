import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { CartLink } from "@/components/cart/cart-link";
import { buttonVariants } from "@/components/ui/button";
import { getStoreBranding } from "@/features/settings/branding";
import { Link } from "@/i18n/navigation";
import { AccountLink } from "./account-link";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { PhoneMenu } from "./phone-menu";
import { ThemeToggle } from "./theme-toggle";
import { TOUCH_TARGET } from "./touch-target";

export async function SiteHeader() {
  const [t, branding] = await Promise.all([getTranslations("common"), getStoreBranding()]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-md text-base font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0 sm:text-lg"
          >
            {branding.logoLight && branding.logoDark ? (
              // The owner's logos carry the name; the box reserves space before they load.
              <>
                <Image
                  src={branding.logoLight}
                  alt={branding.name}
                  width={160}
                  height={32}
                  unoptimized
                  priority
                  className="h-8 w-auto max-w-28 object-contain sm:max-w-40 dark:hidden"
                />
                <Image
                  src={branding.logoDark}
                  alt={branding.name}
                  width={160}
                  height={32}
                  unoptimized
                  priority
                  className="hidden h-8 w-auto max-w-28 object-contain sm:max-w-40 dark:block"
                />
              </>
            ) : (
              <>
                <Logo className="size-7 shrink-0 text-primary" />
                <span className="truncate">{branding.name}</span>
              </>
            )}
          </Link>
          <nav aria-label={t("nav.primary")} className="shrink-0 max-sm:hidden">
            <Link
              href="/products"
              className={buttonVariants({ variant: "ghost", size: "sm", className: TOUCH_TARGET })}
            >
              {t("nav.products")}
            </Link>
          </nav>
        </div>
        {/* Personal UI (cart count, account) is resolved in the browser so pages stay static. */}
        <div className="flex shrink-0 items-center gap-1">
          <CartLink />
          <AccountLink />
          <div className="flex items-center gap-1 max-sm:hidden">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <div className="sm:hidden">
            <PhoneMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
