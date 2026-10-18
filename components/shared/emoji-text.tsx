import { Fragment } from "react";
import { splitEmoji } from "@/lib/emoji";

type EmojiTextProps = {
  text: string;
};

/**
 * Renders content text with emoji replaced by self-hosted Twemoji images, so emoji look
 * the same on every platform. The `alt` keeps the original character for copy/paste and
 * screen readers. Not for <title>, meta tags, form inputs or emails — use native emoji there.
 */
export function EmojiText({ text }: EmojiTextProps) {
  return splitEmoji(text).map((segment, index) =>
    segment.type === "text" ? (
      <Fragment key={index}>{segment.text}</Fragment>
    ) : (
      // next/image adds nothing for 1em vector glyphs and would require fixed dimensions.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={index}
        src={segment.src}
        alt={segment.text}
        draggable={false}
        loading="lazy"
        decoding="async"
        className="me-[0.1em] ms-[0.05em] inline-block size-[1em] align-[-0.1em]"
      />
    ),
  );
}
