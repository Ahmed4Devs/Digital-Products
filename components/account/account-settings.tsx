"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { useActionForm } from "@/components/admin/use-action-form";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { TextField } from "@/components/auth/text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
} from "@/features/account/actions";
import { useRouter } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions";

/** Account action results are keys under `account.errors` / `account.notices`. */
function useAccountMessages() {
  const t = useTranslations("account");
  return {
    field(state: ActionState, name: string): string | undefined {
      const key = state.fieldErrors?.[name];
      if (!key) return undefined;
      return t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.unexpected");
    },
    alert(state: ActionState) {
      if (state.status === "error" && !state.fieldErrors) {
        const key = `errors.${state.message}`;
        return (
          <FormAlert tone="error">
            {t.has(key as never) ? t(key as never) : t("errors.unexpected")}
          </FormAlert>
        );
      }
      if (state.status === "success" && state.message) {
        return <FormAlert tone="success">{t(`notices.${state.message}` as never)}</FormAlert>;
      }
      return null;
    },
  };
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ChangeEmailForm() {
  const t = useTranslations("account.settings");
  const locale = useLocale();
  const messages = useAccountMessages();
  const form = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(changeEmailAction, () =>
    form.current?.reset(),
  );

  return (
    <Section id="change-email" title={t("emailTitle")} description={t("emailDescription")}>
      <form ref={form} onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <TextField
          id="change-email-new"
          name="newEmail"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          label={t("newEmail")}
          error={messages.field(state, "newEmail")}
        />
        <TextField
          id="change-email-password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          label={t("currentPassword")}
          error={messages.field(state, "password")}
        />
        {messages.alert(state)}
        <div className="sm:w-48">
          <SubmitButton pending={pending}>{t("emailSubmit")}</SubmitButton>
        </div>
      </form>
    </Section>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations("account.settings");
  const tAuth = useTranslations("auth.fields");
  const locale = useLocale();
  const messages = useAccountMessages();
  const form = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(changePasswordAction, () =>
    form.current?.reset(),
  );

  return (
    <Section id="change-password" title={t("passwordTitle")} description={t("passwordDescription")}>
      <form ref={form} onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <TextField
          id="change-password-current"
          name="currentPassword"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          label={t("currentPassword")}
          error={messages.field(state, "currentPassword")}
        />
        <TextField
          id="change-password-new"
          name="newPassword"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          minLength={8}
          required
          label={t("newPassword")}
          hint={tAuth("passwordHint")}
          error={messages.field(state, "newPassword")}
        />
        <TextField
          id="change-password-confirm"
          name="confirmPassword"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          label={t("confirmPassword")}
          error={messages.field(state, "confirmPassword")}
        />
        {messages.alert(state)}
        <div className="sm:w-48">
          <SubmitButton pending={pending}>{t("passwordSubmit")}</SubmitButton>
        </div>
      </form>
    </Section>
  );
}

export function DeleteAccountForm() {
  const t = useTranslations("account.settings");
  const locale = useLocale();
  const router = useRouter();
  const messages = useAccountMessages();
  const { state, pending, onSubmit } = useActionForm(deleteAccountAction, () => {
    router.replace({ pathname: "/sign-in", query: { notice: "account-deleted" } });
    router.refresh();
  });
  const confirmError = messages.field(state, "confirm");

  return (
    <Section id="delete-account" title={t("deleteTitle")} description={t("deleteDescription")}>
      <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <TextField
          id="delete-account-password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          label={t("currentPassword")}
          error={messages.field(state, "password")}
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <Checkbox
              id="delete-account-confirm"
              name="confirm"
              aria-invalid={confirmError ? true : undefined}
              aria-describedby={confirmError ? "delete-account-confirm-error" : undefined}
            />
            <Label htmlFor="delete-account-confirm" className="leading-snug">
              {t("deleteConfirm")}
            </Label>
          </div>
          {confirmError ? (
            <p id="delete-account-confirm-error" className="text-xs font-medium text-destructive">
              {confirmError}
            </p>
          ) : null}
        </div>
        {state.status === "success" ? null : messages.alert(state)}
        <div className="sm:w-48">
          <SubmitButton pending={pending} variant="destructive">
            {t("deleteSubmit")}
          </SubmitButton>
        </div>
      </form>
    </Section>
  );
}
