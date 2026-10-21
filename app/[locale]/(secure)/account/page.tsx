import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountForm,
} from "@/components/account/account-settings";
import { FormAlert } from "@/components/auth/form-alert";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LtrText } from "@/components/shared/ltr-text";
import { requireCustomer } from "@/lib/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.overview");
  return { title: t("metadataTitle") };
}

// Profile and account settings (spec §6.1): email change with re-verification, password
// change, and account deletion that keeps order records.
export default async function AccountPage({ searchParams }: PageProps<"/[locale]/account">) {
  const [t, user, query] = await Promise.all([
    getTranslations("account.overview"),
    requireCustomer({ next: "/account" }),
    searchParams,
  ]);
  const emailNotice = query.notice === "email-changed" ? (query.error ? "error" : "success") : null;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t.rich("signedInAs", { email: () => <LtrText>{user.email}</LtrText> })}
        </p>
      </div>
      {emailNotice === "success" ? <FormAlert tone="success">{t("emailChanged")}</FormAlert> : null}
      {emailNotice === "error" ? (
        <FormAlert tone="error">{t("emailChangeFailed")}</FormAlert>
      ) : null}
      <ChangeEmailForm />
      <ChangePasswordForm />
      <DeleteAccountForm />
      <div>
        <SignOutButton />
      </div>
    </section>
  );
}
