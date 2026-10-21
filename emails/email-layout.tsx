import type { Locale } from "next-intl";
import type { ReactNode } from "react";
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "react-email";
import { getDirection } from "@/i18n/locale";

// Emails use a light design whose colours stay legible when a mail client applies its
// own dark mode: dark text on white, and a mid-blue button with white text.
export const emailColors = {
  background: "#f4f5f7",
  card: "#ffffff",
  text: "#1f2328",
  muted: "#57606a",
  border: "#d8dee4",
  primary: "#1f5fae",
  primaryText: "#ffffff",
} as const;

const fontFamily = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif';

type EmailLayoutProps = {
  locale: Locale;
  preview: string;
  footer: string;
  children: ReactNode;
};

/** Shared shell for every transactional email: language, direction, light palette. */
export function EmailLayout({ locale, preview, footer, children }: EmailLayoutProps) {
  const dir = getDirection(locale);

  return (
    <Html lang={locale} dir={dir}>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: "24px 0",
          backgroundColor: emailColors.background,
          color: emailColors.text,
          fontFamily,
        }}
      >
        <Container
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            padding: "32px",
            backgroundColor: emailColors.card,
            border: `1px solid ${emailColors.border}`,
            borderRadius: "12px",
            direction: dir,
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          {children}
          <Hr style={{ borderColor: emailColors.border, margin: "32px 0 16px" }} />
          <Section>
            <Text style={{ margin: 0, fontSize: "12px", color: emailColors.muted }}>{footer}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
