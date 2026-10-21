"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-messages";
import { checkEmail, formPassword, formString } from "@/lib/auth/form-schemas";
import { safeNextPath } from "@/lib/auth/redirects";
import { FormAlert } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

type State = { error?: AuthErrorKey };

export function SignInForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const notice = searchParams.get("notice");

  const [state, formAction, pending] = useActionState(
    async (_previous: State, formData: FormData): Promise<State> => {
      const email = formString(formData, "email");
      const invalid = checkEmail(email);
      if (invalid) return { error: invalid };

      const { error } = await authClient.signIn.email({
        email,
        password: formPassword(formData, "password"),
        rememberMe: formData.get("rememberMe") === "on",
      });
      if (error) return { error: authErrorKey(error) };

      router.replace(next ?? "/account");
      router.refresh();
      return {};
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {notice === "verified" ? (
        <FormAlert tone="success">{t("signIn.verifiedNotice")}</FormAlert>
      ) : null}
      {notice === "password-reset" ? (
        <FormAlert tone="success">{t("signIn.resetNotice")}</FormAlert>
      ) : null}
      {notice === "account-deleted" ? (
        <FormAlert tone="success">{t("signIn.deletedNotice")}</FormAlert>
      ) : null}
      {state.error ? <FormAlert tone="error">{t(`errors.${state.error}`)}</FormAlert> : null}
      <TextField
        id="sign-in-email"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="email"
        required
        label={t("fields.email")}
      />
      <TextField
        id="sign-in-password"
        name="password"
        type="password"
        dir="ltr"
        autoComplete="current-password"
        required
        label={t("fields.password")}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="font-normal">
          <Checkbox name="rememberMe" defaultChecked />
          {t("fields.rememberMe")}
        </Label>
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t("signIn.forgotPassword")}
        </Link>
      </div>
      <SubmitButton pending={pending}>{t("signIn.submit")}</SubmitButton>
    </form>
  );
}
