import "server-only";
import sanitizeHtml from "sanitize-html";
import { splitEmoji } from "@/lib/emoji";
import { RICH_TEXT_OPTIONS } from "./sanitize";

/** Same sizing as components/shared/emoji-text.tsx. */
const EMOJI_IMG_CLASS = "me-[0.1em] ms-[0.05em] inline-block size-[1em] align-[-0.1em]";

/**
 * Replaces emoji in an already-escaped text node with self-hosted Twemoji images. The
 * text segments stay exactly as escaped by the sanitizer; the `<img>` markup is built
 * here from parser output (a known path and the emoji itself), never from input HTML.
 */
function twemojiTextFilter(escapedText: string): string {
  return splitEmoji(escapedText)
    .map((segment) =>
      segment.type === "text"
        ? segment.text
        : `<img src="${segment.src}" alt="${segment.text}" draggable="false" loading="lazy" decoding="async" class="${EMOJI_IMG_CLASS}">`,
    )
    .join("");
}

/**
 * Product description HTML ready for rendering: sanitized again with the allowlist
 * (defense in depth, spec §5.1) and with emoji rendered as Twemoji (spec §7.6).
 */
export function renderRichTextHtml(html: string): string {
  return sanitizeHtml(html, { ...RICH_TEXT_OPTIONS, textFilter: twemojiTextFilter });
}
