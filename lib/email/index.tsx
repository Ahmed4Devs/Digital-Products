import "server-only";
import type { Locale } from "next-intl";
import { render } from "react-email";
import { AuthEmail, authEmailSubject, type AuthEmailKind } from "@/emails/auth-email";
import { serverEnv } from "@/lib/env/server";
import {
  createMailpitTransport,
  createResendTransport,
  type EmailMessage,
  type EmailTransport,
} from "./transport";

let transport: EmailTransport | undefined;

/** Resend when an API key is configured, otherwise the local Mailpit capture. */
export function getEmailTransport(): EmailTransport {
  if (!transport) {
    const env = serverEnv();
    if (env.RESEND_API_KEY) {
      transport = createResendTransport(env.RESEND_API_KEY, env.MAIL_FROM);
    } else if (env.MAILPIT_URL) {
      transport = createMailpitTransport(env.MAILPIT_URL, env.MAIL_FROM);
    } else {
      // Unreachable: the environment schema requires one of the two.
      throw new Error("No email transport is configured");
    }
  }
  return transport;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getEmailTransport().send(message);
}

type AuthEmailRequest = {
  kind: AuthEmailKind;
  to: string;
  locale: Locale;
  url: string;
};

/** Renders and sends a verification, magic-link or password-reset email. */
export async function sendAuthEmail({ kind, to, locale, url }: AuthEmailRequest): Promise<void> {
  const element = <AuthEmail kind={kind} locale={locale} url={url} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  await sendEmail({ to, subject: authEmailSubject(kind, locale), html, text });
}
