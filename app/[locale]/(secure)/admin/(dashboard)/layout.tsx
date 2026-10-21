import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { IntlNamespaces } from "@/components/layout/intl-namespaces";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { requireOwner } from "@/lib/auth/dal";

// Verified before anything streams: anyone but the owner gets a genuine 404 (spec §6.2).
// The full admin shell and navigation arrive in Phase 5.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/[locale]">) {
  await requireOwner();
  const t = await getTranslations("common");

  return (
    <IntlNamespaces namespaces={["auth", "admin"]}>
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <Logo className="size-7 text-primary" />
            {t("storeName")}
          </span>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <SignOutButton redirectTo="/admin/sign-in" />
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
    </IntlNamespaces>
  );
}
