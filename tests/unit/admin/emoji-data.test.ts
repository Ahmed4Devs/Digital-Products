import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PICKER_EMOJI, twemojiFile } from "@/components/admin/emoji-data";

describe("emoji picker data", () => {
  it("has a self-hosted Twemoji file for every emoji", () => {
    const missing = PICKER_EMOJI.filter(
      (emoji) => !existsSync(resolve("public/twemoji", `${twemojiFile(emoji)}.svg`)),
    );
    expect(missing).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(new Set(PICKER_EMOJI).size).toBe(PICKER_EMOJI.length);
  });

  it("drops the emoji variation selector from file names", () => {
    expect(twemojiFile("❤️")).toBe("2764");
    expect(twemojiFile("✨")).toBe("2728");
    expect(twemojiFile("🕌")).toBe("1f54c");
  });
});
