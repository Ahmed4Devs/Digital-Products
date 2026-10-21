"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { RichTextEditorProps } from "./rich-text-editor";

function EditorLoading() {
  const t = useTranslations("admin.editor");
  return (
    <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      {t("loading")}
    </div>
  );
}

// The editor (Tiptap/ProseMirror) is admin-only and never part of the storefront bundle.
const RichTextEditor = dynamic(() => import("./rich-text-editor"), {
  ssr: false,
  loading: EditorLoading,
});

type LazyRichTextEditorProps = Omit<RichTextEditorProps, "onChange"> & {
  /** Form field name of the hidden input that carries the HTML. */
  name: string;
};

/**
 * Lazy rich-text editor. The hidden input lives outside the lazy chunk, so a submit
 * before the editor has loaded still sends the existing description.
 */
export function LazyRichTextEditor({ name, ...props }: LazyRichTextEditorProps) {
  const [html, setHtml] = useState(props.defaultValue);
  return (
    <>
      <RichTextEditor {...props} onChange={setHtml} />
      <input type="hidden" name={name} value={html} />
    </>
  );
}
