"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { getPathname } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-messages";
import { checkEmail, formString } from "@/lib/auth/form-schemas";
import { safeNextPath } from "@/lib/auth/redirects";
import { FormAlert } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

type State = { error?: AuthErrorKey; sent?: boolean };

export function MagicLinkForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next")) ?? "/account";
  const linkFailed = searchParams.get("error") === "magic-link";

  const [state, formAction, pending] = useActionState(
    async (_previous: State, formData: FormData): Promise<State> => {
      const email = formString(formData, "email");
      const invalid = checkEmail(email);
      if (invalid) return { error: invalid };

      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: getPathname({ href: next, locale }),
        errorCallbackURL: getPathname({
          href: { pathname: "/sign-in", query: { error: "magic-link" } },
          locale,
        }),
      });
      // Unknown and known addresses get the same confirmation (no account enumeration).
      if (error && error.status === 429) return { error: authErrorKey(error) };
      return { sent: true };
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="text-base font-semibold">{t("signIn.magicLinkTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("signIn.magicLinkDescription")}</p>
      </div>
      {linkFailed && !state.sent ? (
        <FormAlert tone="error">{t("signIn.magicLinkFailed")}</FormAlert>
      ) : null}
      {state.error ? <FormAlert tone="error">{t(`errors.${state.error}`)}</FormAlert> : null}
      {state.sent ? <FormAlert tone="success">{t("signIn.magicLinkSent")}</FormAlert> : null}
      <TextField
        id="magic-link-email"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="email"
        required
        label={t("fields.email")}
      />
      <SubmitButton pending={pending}>{t("signIn.magicLinkSubmit")}</SubmitButton>
    </form>
  );
}
