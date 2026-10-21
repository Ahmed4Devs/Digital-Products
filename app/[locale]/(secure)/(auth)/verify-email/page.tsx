import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { safeNextPath } from "@/lib/auth/redirects";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.verifyEmail");
  return { title: t("metadataTitle") };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Landing page of the verification link. Better Auth verifies the token in
 * /api/auth/verify-email and redirects here with `status=verified`, or with `error=…`.
 */
async function VerificationResult({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [t, params] = await Promise.all([getTranslations("auth.verifyEmail"), searchParams]);
  const next = safeNextPath(params.next);
  const state = params.error ? "error" : params.status === "verified" ? "success" : "pending";
  const signInQuery: Record<string, string> = state === "success" ? { notice: "verified" } : {};
  if (next) signInQuery.next = next;

  return (
    <>
      <FormAlert tone={state === "error" ? "error" : "success"}>
        <p className="font-semibold">{t(`${state}Title`)}</p>
        <p className="mt-1">{t(`${state}Body`)}</p>
      </FormAlert>
      <Link
        href={{ pathname: "/sign-in", query: signInQuery }}
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        {t("signInLink")}
      </Link>
    </>
  );
}

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/[locale]/verify-email">) {
  const t = await getTranslations("auth.verifyEmail");

  return (
    <AuthCard title={t("metadataTitle")}>
      <Suspense fallback={null}>
        <VerificationResult searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
