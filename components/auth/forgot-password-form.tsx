"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { getPathname } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-messages";
import { checkEmail, formString } from "@/lib/auth/form-schemas";
import { FormAlert } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

type State = { error?: AuthErrorKey; sent?: boolean };

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();

  const [state, formAction, pending] = useActionState(
    async (_previous: State, formData: FormData): Promise<State> => {
      const email = formString(formData, "email");
      const invalid = checkEmail(email);
      if (invalid) return { error: invalid };

      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: getPathname({ href: "/reset-password", locale }),
      });
      if (error && error.status === 429) return { error: authErrorKey(error) };
      return { sent: true };
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormAlert tone="error">{t(`errors.${state.error}`)}</FormAlert> : null}
      {state.sent ? <FormAlert tone="success">{t("forgotPassword.sent")}</FormAlert> : null}
      <TextField
        id="forgot-password-email"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="email"
        required
        label={t("fields.email")}
      />
      <SubmitButton pending={pending}>{t("forgotPassword.submit")}</SubmitButton>
    </form>
  );
}
