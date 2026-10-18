import "server-only";
import { parse } from "@twemoji/parser";

/** Public path of the vendored Twemoji SVGs (see scripts/sync-twemoji.mjs). */
export const TWEMOJI_BASE_PATH = "/twemoji";

export type EmojiSegment =
  { type: "text"; text: string } | { type: "emoji"; text: string; src: string };

function buildUrl(codepoints: string): string {
  return `${TWEMOJI_BASE_PATH}/${codepoints}.svg`;
}

/**
 * Splits text into plain-text and emoji segments, mapping each emoji to its self-hosted
 * Twemoji SVG. Runs on the server only so no parser ships to the browser.
 */
export function splitEmoji(text: string): EmojiSegment[] {
  const segments: EmojiSegment[] = [];
  let cursor = 0;

  for (const entity of parse(text, { assetType: "svg", buildUrl })) {
    const [start, end] = entity.indices;
    if (!entity.url) continue;
    if (start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, start) });
    }
    segments.push({ type: "emoji", text: entity.text, src: entity.url });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }
  return segments;
}
