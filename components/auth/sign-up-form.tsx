"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useActionState, useCallback, useState } from "react";
import { LtrText } from "@/components/shared/ltr-text";
import { getPathname } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-messages";
import { checkEmail, checkNewPassword, formPassword, formString } from "@/lib/auth/form-schemas";
import { safeNextPath } from "@/lib/auth/redirects";
import { CAPTCHA_HEADER, TURNSTILE_TEST_TOKEN } from "@/lib/auth/turnstile";
import { FormAlert } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";
import { TurnstileWidget } from "./turnstile-widget";

export type CaptchaConfig = { mode: "turnstile"; siteKey: string } | { mode: "test" };

type State = { error?: AuthErrorKey; sentTo?: string };

export function SignUpForm({ captcha }: { captcha: CaptchaConfig }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  const onToken = useCallback((token: string | null) => setWidgetToken(token), []);
  const captchaToken = captcha.mode === "test" ? TURNSTILE_TEST_TOKEN : widgetToken;

  const [state, formAction, pending] = useActionState(
    async (_previous: State, formData: FormData): Promise<State> => {
      const email = formString(formData, "email");
      const password = formPassword(formData, "password");
      const invalid = checkEmail(email) ?? checkNewPassword(password);
      if (invalid) return { error: invalid };
      if (!captchaToken) return { error: "captchaRequired" };

      const query: Record<string, string> = { status: "verified" };
      if (next) query.next = next;
      const { error } = await authClient.signUp.email(
        {
          email,
          password,
          // Required by Better Auth; the server derives it from the email (spec §6.1).
          name: "",
          preferredLocale: locale === "en" ? "en" : "ar",
          callbackURL: getPathname({ href: { pathname: "/verify-email", query }, locale }),
        },
        { headers: { [CAPTCHA_HEADER]: captchaToken } },
      );
      if (error) return { error: authErrorKey(error) };
      // The same answer whether or not the email already had an account.
      return { sentTo: email };
    },
    {},
  );

  if (state.sentTo) {
    return (
      <FormAlert tone="success">
        <p className="font-semibold">{t("signUp.checkInboxTitle")}</p>
        <p className="mt-1">
          {t.rich("signUp.checkInboxBody", { email: () => <LtrText>{state.sentTo}</LtrText> })}
        </p>
      </FormAlert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormAlert tone="error">{t(`errors.${state.error}`)}</FormAlert> : null}
      <TextField
        id="sign-up-email"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="email"
        required
        label={t("fields.email")}
      />
      <TextField
        id="sign-up-password"
        name="password"
        type="password"
        dir="ltr"
        autoComplete="new-password"
        minLength={8}
        required
        label={t("fields.password")}
        hint={t("fields.passwordHint")}
      />
      {captcha.mode === "turnstile" ? (
        <TurnstileWidget
          siteKey={captcha.siteKey}
          locale={locale}
          label={t("signUp.captchaLabel")}
          onToken={onToken}
        />
      ) : null}
      <SubmitButton pending={pending}>{t("signUp.submit")}</SubmitButton>
    </form>
  );
}
