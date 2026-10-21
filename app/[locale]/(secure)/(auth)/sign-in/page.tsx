import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormSkeleton } from "@/components/auth/form-skeleton";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("metadataTitle") };
}

export default async function SignInPage() {
  const t = await getTranslations("auth.signIn");

  return (
    <AuthCard
      title={t("title")}
      description={t("description")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link
            href="/sign-up"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signUpLink")}
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <SignInForm />
      </Suspense>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <MagicLinkForm />
      </Suspense>
    </AuthCard>
  );
}
