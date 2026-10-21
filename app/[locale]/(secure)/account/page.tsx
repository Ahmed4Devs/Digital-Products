import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LtrText } from "@/components/shared/ltr-text";
import { requireCustomer } from "@/lib/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.overview");
  return { title: t("metadataTitle") };
}

// Overview; orders and profile settings arrive in Phases 7–8.
export default async function AccountPage() {
  const [t, user] = await Promise.all([
    getTranslations("account.overview"),
    requireCustomer({ next: "/account" }),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">
        {t.rich("signedInAs", { email: () => <LtrText>{user.email}</LtrText> })}
      </p>
      <p className="text-muted-foreground">{t("comingSoon")}</p>
      <div>
        <SignOutButton />
      </div>
    </section>
  );
}
