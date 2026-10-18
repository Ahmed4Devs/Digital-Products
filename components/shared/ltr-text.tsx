import type { ReactNode } from "react";

/**
 * Isolates a left-to-right fragment (email, order number, username, URL) so it is not
 * reordered inside right-to-left Arabic text. Use for any LTR value embedded in a sentence.
 */
export function LtrText({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
