import { createProxy, lookUpOwnerSession } from "@/lib/proxy/create-proxy";

// See lib/proxy/create-proxy.ts: locale negotiation, optimistic redirects and genuine
// 404s for the admin. Never a security boundary (spec §6.3).
export default createProxy(lookUpOwnerSession);

export const config = {
  // Everything except API routes, Next.js internals and files with an extension
  // (e.g. /favicon.ico, /twemoji/1f600.svg).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
