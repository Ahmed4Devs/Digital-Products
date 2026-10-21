import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { OwnerSignInForm } from "@/components/auth/owner-sign-in-form";
import { IntlNamespaces } from "@/components/layout/intl-namespaces";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.admin");
  return { title: t("metadataTitle") };
}

/** Owner sign-in (username + password). Not linked from anywhere in the storefront. */
export default async function OwnerSignInPage() {
  const t = await getTranslations("auth.admin");

  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <div className="flex justify-end gap-1 p-4">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <IntlNamespaces namespaces={["auth"]}>
        <AuthCard title={t("title")} description={t("description")}>
          <OwnerSignInForm />
        </AuthCard>
      </IntlNamespaces>
    </main>
  );
}
