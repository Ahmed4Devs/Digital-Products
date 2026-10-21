"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-messages";
import { formPassword, formString } from "@/lib/auth/form-schemas";
import { FormAlert } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

type State = { error?: AuthErrorKey };

/** Username + password, owner only; every other account gets the generic error. */
export function OwnerSignInForm() {
  const t = useTranslations("auth");
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    async (_previous: State, formData: FormData): Promise<State> => {
      const { error } = await authClient.signIn.username({
        username: formString(formData, "username"),
        password: formPassword(formData, "password"),
      });
      if (error) return { error: authErrorKey(error) };

      router.replace("/admin");
      router.refresh();
      return {};
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormAlert tone="error">{t(`errors.${state.error}`)}</FormAlert> : null}
      <TextField
        id="owner-username"
        name="username"
        dir="ltr"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        label={t("fields.username")}
      />
      <TextField
        id="owner-password"
        name="password"
        type="password"
        dir="ltr"
        autoComplete="current-password"
        required
        label={t("fields.password")}
      />
      <SubmitButton pending={pending}>{t("admin.submit")}</SubmitButton>
    </form>
  );
}
