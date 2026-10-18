import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { messagesByLocale } from "@/messages";
import { formats, TIME_ZONE } from "./formats";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  // `[locale]` is a root param, so it can be read anywhere on the server without
  // setRequestLocale and without opting pages out of static rendering.
  const candidate = locale ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, candidate)) {
    notFound();
  }

  return {
    locale: candidate,
    messages: messagesByLocale[candidate],
    formats,
    timeZone: TIME_ZONE,
  };
});
