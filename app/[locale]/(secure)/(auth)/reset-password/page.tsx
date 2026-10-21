import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormSkeleton } from "@/components/auth/form-skeleton";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.resetPassword");
  // The URL carries the reset token: keep it out of search engines and referrers.
  return { title: t("metadataTitle"), referrer: "no-referrer" };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth.resetPassword");

  return (
    <AuthCard title={t("title")} description={t("description")}>
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
