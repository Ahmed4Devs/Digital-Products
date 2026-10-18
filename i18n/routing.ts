import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  // Every URL carries its locale (/ar/..., /en/...); `/` redirects to the preferred one.
  localePrefix: "always",
  // Remember an explicit language choice for a year instead of only for the session.
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
  },
});
