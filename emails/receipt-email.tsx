import { createTranslator, type Locale } from "next-intl";
import { Button, Column, Heading, Row, Section, Text } from "react-email";
import { formats } from "@/i18n/formats";
import { toMajorUnits, type Currency } from "@/lib/money";
import { messagesByLocale } from "@/messages";
import { EmailLayout, emailColors } from "./email-layout";

// The receipt (spec §10.1 step 10): in the order's language, with a link to My Purchases
// and never a direct download link (spec §5.1).

export type ReceiptLine = { title: string; amountMinor: number };

export type ReceiptEmailProps = {
  locale: Locale;
  storeName: string;
  orderNumber: number;
  paidAt: Date;
  lines: ReceiptLine[];
  subtotalUsdCents: number;
  discountUsdCents: number;
  taxUsdCents: number;
  totalUsdCents: number;
  charged: { currency: Currency; amountMinor: number } | null;
  libraryUrl: string;
};

function translatorFor(locale: Locale) {
  return createTranslator({ locale, messages: messagesByLocale[locale], namespace: "emails" });
}

function money(locale: Locale, amountMinor: number, currency: Currency): string {
  const format = currency === "USD" ? formats.number.usd : formats.number.sar;
  return new Intl.NumberFormat(locale, format).format(toMajorUnits(amountMinor, currency));
}

function orderNumberText(orderNumber: number): string {
  return new Intl.NumberFormat("en", { useGrouping: false }).format(orderNumber);
}

export function receiptSubject(
  props: Pick<ReceiptEmailProps, "locale" | "storeName" | "orderNumber">,
) {
  return translatorFor(props.locale)("receipt.subject", {
    number: orderNumberText(props.orderNumber),
    storeName: props.storeName,
  });
}

const cell = { fontSize: "15px", lineHeight: "1.6", margin: "4px 0" } as const;

export function ReceiptEmail(props: ReceiptEmailProps) {
  const t = translatorFor(props.locale);
  const endAlign = props.locale === "ar" ? "left" : "right";
  const date = new Intl.DateTimeFormat(props.locale, {
    ...formats.dateTime.dateTime,
    timeZone: "Asia/Riyadh",
  }).format(props.paidAt);

  const row = (label: string, value: string, strong = false) => (
    <Row key={label}>
      <Column>
        <Text style={{ ...cell, fontWeight: strong ? 700 : 400 }}>{label}</Text>
      </Column>
      <Column>
        {/* Amounts keep their own direction inside Arabic text. */}
        <Text
          style={{
            ...cell,
            fontWeight: strong ? 700 : 400,
            textAlign: endAlign,
            unicodeBidi: "isolate",
          }}
        >
          {value}
        </Text>
      </Column>
    </Row>
  );

  return (
    <EmailLayout
      locale={props.locale}
      preview={t("receipt.preview")}
      footer={t("common.footer", { storeName: props.storeName })}
    >
      <Heading as="h1" style={{ margin: "0 0 16px", fontSize: "22px", lineHeight: "1.4" }}>
        {t("receipt.heading")}
      </Heading>
      <Text style={{ fontSize: "16px", lineHeight: "1.7" }}>{t("receipt.body")}</Text>
      <Text style={{ fontSize: "14px", color: emailColors.muted, margin: "0" }}>
        {t("receipt.order", { number: orderNumberText(props.orderNumber) })}
      </Text>
      <Text style={{ fontSize: "14px", color: emailColors.muted, marginTop: "0" }}>
        {t("receipt.date", { date })}
      </Text>

      <Section style={{ margin: "16px 0", borderTop: `1px solid ${emailColors.border}` }}>
        {props.lines.map((line) => row(line.title, money(props.locale, line.amountMinor, "USD")))}
      </Section>
      <Section style={{ borderTop: `1px solid ${emailColors.border}` }}>
        {row(t("receipt.subtotal"), money(props.locale, props.subtotalUsdCents, "USD"))}
        {props.discountUsdCents > 0
          ? row(t("receipt.discount"), `−${money(props.locale, props.discountUsdCents, "USD")}`)
          : null}
        {props.taxUsdCents > 0
          ? row(t("receipt.tax"), money(props.locale, props.taxUsdCents, "USD"))
          : null}
        {row(t("receipt.total"), money(props.locale, props.totalUsdCents, "USD"), true)}
        {props.charged
          ? row(
              t("receipt.charged"),
              money(props.locale, props.charged.amountMinor, props.charged.currency),
            )
          : null}
      </Section>

      <Section style={{ margin: "24px 0" }}>
        <Button
          href={props.libraryUrl}
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
          {t("receipt.button")}
        </Button>
      </Section>
      <Text style={{ fontSize: "14px", color: emailColors.muted }}>{t("receipt.security")}</Text>
    </EmailLayout>
  );
}
