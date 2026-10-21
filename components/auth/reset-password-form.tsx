"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-messages";
import { checkNewPassword, formPassword } from "@/lib/auth/form-schemas";
import { FormAlert } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

type State = { error?: AuthErrorKey };

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");

  const [state, formAction, pending] = useActionState(
    async (_previous: State, formData: FormData): Promise<State> => {
      if (!token) return { error: "invalidToken" };
      const newPassword = formPassword(formData, "newPassword");
      const invalid = checkNewPassword(newPassword);
      if (invalid) return { error: invalid };

      const { error } = await authClient.resetPassword({ newPassword, token });
      if (error) return { error: authErrorKey(error) };

      router.replace({ pathname: "/sign-in", query: { notice: "password-reset" } });
      return {};
    },
    {},
  );

  if (!token || linkError) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="error">{t("resetPassword.invalidLink")}</FormAlert>
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t("resetPassword.requestNewLink")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormAlert tone="error">{t(`errors.${state.error}`)}</FormAlert> : null}
      <TextField
        id="reset-password-new"
        name="newPassword"
        type="password"
        dir="ltr"
        autoComplete="new-password"
        minLength={8}
        required
        label={t("fields.newPassword")}
        hint={t("fields.passwordHint")}
      />
      <SubmitButton pending={pending}>{t("resetPassword.submit")}</SubmitButton>
    </form>
  );
}
