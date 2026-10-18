import type { formats } from "@/i18n/formats";
import type { routing } from "@/i18n/routing";
import type { Messages } from "@/messages";

// Makes locales, message keys and format names type-safe across next-intl APIs:
// a missing or misspelled key fails `pnpm typecheck`.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: Messages;
    Formats: typeof formats;
  }
}
