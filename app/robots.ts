import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { appUrl } from "@/lib/env/public";

/** /robots.txt: keep crawlers out of the API and the private areas (spec §8.3). */
export default function robots(): MetadataRoute.Robots {
  const privateAreas = routing.locales.flatMap((locale) => [
    `/${locale}/admin`,
    `/${locale}/account`,
    `/${locale}/checkout`,
  ]);

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", ...privateAreas] }],
    sitemap: new URL("/sitemap.xml", appUrl()).toString(),
  };
}
