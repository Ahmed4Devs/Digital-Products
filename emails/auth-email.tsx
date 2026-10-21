import { createTranslator, type Locale } from "next-intl";
import { Button, Heading, Link, Section, Text } from "react-email";
import { messagesByLocale } from "@/messages";
import { EmailLayout, emailColors } from "./email-layout";

export type AuthEmailKind = "verifyEmail" | "changeEmail" | "magicLink" | "resetPassword";

type AuthEmailProps = {
  kind: AuthEmailKind;
  locale: Locale;
  url: string;
};

function translatorFor(locale: Locale) {
  return createTranslator({ locale, messages: messagesByLocale[locale], namespace: "emails" });
}

/** Subject line; native emoji only (spec §7.6), never Twemoji images. */
export function authEmailSubject(kind: AuthEmailKind, locale: Locale): string {
  const t = translatorFor(locale);
  const storeName = messagesByLocale[locale].common.storeName;
  return t(`${kind}.subject`, { storeName });
}

/** Verification, email-change, magic-link and password-reset emails share one layout. */
export function AuthEmail({ kind, locale, url }: AuthEmailProps) {
  const t = translatorFor(locale);
  const storeName = messagesByLocale[locale].common.storeName;

  return (
    <EmailLayout
      locale={locale}
      preview={t(`${kind}.preview`)}
      footer={t("common.footer", { storeName })}
    >
      <Heading as="h1" style={{ margin: "0 0 16px", fontSize: "22px", lineHeight: "1.4" }}>
        {t(`${kind}.heading`)}
      </Heading>
      <Text style={{ fontSize: "16px", lineHeight: "1.7" }}>{t(`${kind}.body`)}</Text>
      <Section style={{ margin: "24px 0" }}>
        <Button
          href={url}
          style={{
            display: "inline-block",
            padding: "12px 24px",
            borderRadius: "8px",
            backgroundColor: emailColors.primary,
            color: emailColors.primaryText,
            fontSize: "16px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {t(`${kind}.button`)}
        </Button>
      </Section>
      <Text style={{ fontSize: "14px", color: emailColors.muted }}>{t(`${kind}.expiry`)}</Text>
      <Text style={{ fontSize: "14px", color: emailColors.muted }}>{t("common.linkFallback")}</Text>
      {/* URLs are left-to-right even inside an Arabic email. */}
      <Text
        style={{ fontSize: "13px", wordBreak: "break-all", direction: "ltr", textAlign: "left" }}
      >
        <Link href={url} style={{ color: emailColors.primary }}>
          {url}
        </Link>
      </Text>
      <Text style={{ fontSize: "14px", color: emailColors.muted }}>{t("common.ignore")}</Text>
    </EmailLayout>
  );
}
