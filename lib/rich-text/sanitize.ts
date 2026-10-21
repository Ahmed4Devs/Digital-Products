import sanitizeHtml, { type IOptions } from "sanitize-html";

// Allowlist for product descriptions (spec §5.1). On catalog pages there is no CSP nonce
// (spec §17.5 §2), so this sanitizer is the primary XSS defense: no scripts, no event
// handler attributes, no styles or classes, and links only to http(s) and mailto.
// Everything not listed is dropped; script/style contents are dropped with their tags.

const DIR = { name: "dir", multiple: false, values: ["ltr", "rtl", "auto"] };
const BLOCK_TAGS = ["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre"];

export const RICH_TEXT_OPTIONS: IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "code",
    "pre",
    "hr",
  ],
  allowedAttributes: {
    // rel and target are always overwritten by the transform below.
    a: ["href", "title", "rel", "target", DIR],
    // Mixed Arabic/English blocks may need an explicit direction.
    ...Object.fromEntries(BLOCK_TAGS.map((tag) => [tag, [DIR]])),
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // Links leave the store in a new tab without passing the referrer or ranking signal.
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
};

/** Allowlist-sanitized HTML. Run on write (owner editor) and again on render. */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, RICH_TEXT_OPTIONS);
}
