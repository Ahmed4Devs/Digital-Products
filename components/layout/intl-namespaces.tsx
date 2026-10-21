import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { formats, TIME_ZONE } from "@/i18n/formats";
import type { MessageNamespace } from "@/messages";

type IntlNamespacesProps = {
  namespaces: readonly Exclude<MessageNamespace, "common">[];
  children: ReactNode;
};

/**
 * Ships extra message namespaces to the client components below it. The root layout
 * only sends `common`, so storefront visitors never download auth or admin strings.
 */
export async function IntlNamespaces({ namespaces, children }: IntlNamespacesProps) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const selected: Partial<typeof messages> = { common: messages.common };
  for (const namespace of namespaces) {
    Object.assign(selected, { [namespace]: messages[namespace] });
  }

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={selected}
      formats={formats}
      timeZone={TIME_ZONE}
    >
      {children}
    </NextIntlClientProvider>
  );
}
