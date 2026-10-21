import type { LegalPage } from "./schemas";

// The public legal pages (spec §8.1, Phase 9): URL slug → the settings columns the owner
// edits. Client-safe constants.

export const LEGAL_SLUGS = {
  terms: "terms",
  privacy: "privacy",
  "refund-policy": "refundPolicy",
  about: "about",
  contact: "contact",
} as const satisfies Record<string, LegalPage>;

export type LegalSlug = keyof typeof LEGAL_SLUGS;

export function isLegalSlug(slug: string): slug is LegalSlug {
  return Object.hasOwn(LEGAL_SLUGS, slug);
}

export function legalHref(slug: LegalSlug): string {
  return `/legal/${slug}`;
}
