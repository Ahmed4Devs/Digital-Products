"use client";

import { PICKER_EMOJI, twemojiFile } from "./emoji-data";

/** The picker's contents; loaded only when the picker first opens. */
export default function EmojiGrid({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div role="group" className="grid grid-cols-8 gap-1">
      {PICKER_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="flex size-8 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 1em vector glyphs */}
          <img
            src={`/twemoji/${twemojiFile(emoji)}.svg`}
            alt={emoji}
            className="size-5"
            draggable={false}
          />
        </button>
      ))}
    </div>
  );
}
