import type { NextRequest } from "next/server";

// Pages in the `(secure)` group render per request, but Next.js still answers a browser
// with the route's prerendered shell first, so the status is already 200 when a page
// calls notFound() or redirect(). Requests whose User-Agent matches `htmlLimitedBots`
// skip that shell and render in one blocking pass, which keeps the 404 or 307. proxy.ts
// marks document requests to those routes, and next.config.ts adds the marker to the list.

export const BLOCKING_RENDER_MARKER = "StoreBlockingRender";

/**
 * Next.js' default HTML-limited bots (next/dist/shared/lib/router/utils/html-bots), which
 * a `htmlLimitedBots` setting replaces. A unit test keeps this copy in step with Next.js.
 */
const NEXT_HTML_LIMITED_BOTS =
  /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i;

export const HTML_LIMITED_BOTS = new RegExp(
  `${NEXT_HTML_LIMITED_BOTS.source}|${BLOCKING_RENDER_MARKER}`,
  "i",
);

/**
 * Page loads only, told apart by asking for HTML: Next.js removes the RSC headers before
 * the proxy runs, and client navigations and prefetches accept anything. Marking those
 * leaves the router waiting on prefetches that never finish. Server Actions (POST) keep
 * the real User-Agent for the sessions they create.
 */
export function needsBlockingRender(request: NextRequest): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    (request.headers.get("accept") ?? "").includes("text/html")
  );
}

export function markUserAgent(userAgent: string | null): string {
  return userAgent ? `${userAgent} ${BLOCKING_RENDER_MARKER}` : BLOCKING_RENDER_MARKER;
}
