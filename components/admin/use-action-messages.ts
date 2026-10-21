"use client";

import { useTranslations } from "next-intl";

/**
 * Translates the message keys Server Actions return (lib/actions). Unknown keys fall
 * back to a generic message rather than showing a raw key.
 */
export function useActionMessages() {
  const t = useTranslations("admin");
  return {
    error(key: string | undefined): string {
      const path = `errors.${key}`;
      return key && t.has(path as never) ? t(path as never) : t("errors.unexpected");
    },
    notice(key: string | undefined): string | null {
      const path = `notices.${key}`;
      return key && t.has(path as never) ? t(path as never) : null;
    },
  };
}
