import { notFound } from "next/navigation";

// Any path no route matches, under a known locale, gets the translated 404 inside the
// store layout (with a real 404 status), instead of Next.js's untranslated default.
export default function UnmatchedPath(): never {
  notFound();
}
