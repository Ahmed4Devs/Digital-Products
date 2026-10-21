import { ExternalLinkIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { IntlNamespaces } from "@/components/layout/intl-namespaces";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { getStoreBranding } from "@/features/settings/branding";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";

// Verified before anything streams: anyone but the owner gets a genuine 404 (spec §6.2).
// Every page and Server Action below re-checks; this layout is not the security boundary.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/[locale]">) {
  await requireOwner();
  const [t, branding] = await Promise.all([getTranslations("admin.shell"), getStoreBranding()]);

  return (
    <IntlNamespaces namespaces={["auth", "admin"]}>
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="border-b bg-muted/30 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-e lg:border-b-0">
          <div className="flex h-16 items-center gap-2 px-4">
            <Logo className="size-7 text-primary" />
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">{branding.name}</span>
              <span className="text-xs text-muted-foreground">{t("title")}</span>
            </span>
          </div>
          <AdminNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-end gap-1 border-b px-4 sm:px-6">
            {/* Opens the store in a new tab; the storefront never links back here (spec §11). */}
            <Link
              href="/"
              target="_blank"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ExternalLinkIcon aria-hidden="true" className="rtl:-scale-x-100" />
              {t("viewStore")}
            </Link>
            <LanguageSwitcher />
            <ThemeToggle />
            <SignOutButton redirectTo="/admin/sign-in" />
          </header>
          <main id="main-content" className="flex-1 px-4 py-8 sm:px-6">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </IntlNamespaces>
  );
}
