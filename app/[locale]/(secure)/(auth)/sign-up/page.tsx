import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormSkeleton } from "@/components/auth/form-skeleton";
import { SignUpForm, type CaptchaConfig } from "@/components/auth/sign-up-form";
import { Link } from "@/i18n/navigation";
import { serverEnv } from "@/lib/env/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("metadataTitle") };
}

/** The Turnstile site key is read at request time, so images need no build-time keys. */
async function SignUpSection() {
  await connection();
  const env = serverEnv();
  const captcha: CaptchaConfig =
    env.TEST_DOUBLES === "on" || !env.TURNSTILE_SITE_KEY
      ? { mode: "test" }
      : { mode: "turnstile", siteKey: env.TURNSTILE_SITE_KEY };
  return <SignUpForm captcha={captcha} />;
}

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");

  return (
    <AuthCard
      title={t("title")}
      description={t("description")}
      footer={
        <>
          {t("hasAccount")}{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signInLink")}
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <SignUpSection />
      </Suspense>
    </AuthCard>
  );
}
