import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LtrText } from "@/components/shared/ltr-text";

describe("<LtrText>", () => {
  it("isolates left-to-right fragments inside right-to-left text", () => {
    expect(renderToStaticMarkup(<LtrText>owner@example.com</LtrText>)).toBe(
      '<bdi dir="ltr">owner@example.com</bdi>',
    );
  });
});
