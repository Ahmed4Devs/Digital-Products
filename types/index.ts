// Shared application types. Domain-specific types live next to their features and are
// re-exported here when more than one feature needs them.

export type { Locale } from "next-intl";
export type { Direction } from "@/i18n/locale";
export type { MessageNamespace, Messages } from "@/messages";
