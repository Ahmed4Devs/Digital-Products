"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  Undo2Icon,
  UnlinkIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmojiButton } from "./emoji-button";

// The owner's rich-text editor (spec §11): admin only, loaded lazily, and limited to the
// tags the sanitizer allows (lib/rich-text/sanitize.ts). Its HTML is sanitized again on
// the server before it is stored, and once more when rendered.

export type RichTextEditorProps = {
  defaultValue: string;
  /** Receives the HTML after every change ("" when empty). */
  onChange: (html: string) => void;
  labelId: string;
  dir: "rtl" | "ltr";
  lang: string;
};

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor, labelId }: { editor: Editor; labelId: string }) {
  const t = useTranslations("admin.editor");
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
      link: current.isActive("link"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  function addLink() {
    const url = window.prompt(t("linkPrompt"))?.trim();
    if (!url || !SAFE_LINK.test(url)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label={t("toolbar")}
      aria-describedby={labelId}
      className="flex flex-wrap items-center gap-0.5 border-b p-1"
    >
      <ToolbarButton
        label={t("bold")}
        pressed={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label={t("italic")}
        pressed={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label={t("heading")}
        pressed={state.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2Icon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label={t("subheading")}
        pressed={state.h3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3Icon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label={t("bulletList")}
        pressed={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListIcon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label={t("orderedList")}
        pressed={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrderedIcon aria-hidden="true" className="rtl:-scale-x-100" />
      </ToolbarButton>
      <ToolbarButton
        label={t("blockquote")}
        pressed={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <QuoteIcon aria-hidden="true" />
      </ToolbarButton>
      {state.link ? (
        <ToolbarButton label={t("unlink")} onClick={() => editor.chain().focus().unsetLink().run()}>
          <UnlinkIcon aria-hidden="true" />
        </ToolbarButton>
      ) : (
        <ToolbarButton label={t("link")} onClick={addLink}>
          <LinkIcon aria-hidden="true" />
        </ToolbarButton>
      )}
      <ToolbarButton
        label={t("undo")}
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2Icon aria-hidden="true" className="rtl:-scale-x-100" />
      </ToolbarButton>
      <ToolbarButton
        label={t("redo")}
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2Icon aria-hidden="true" className="rtl:-scale-x-100" />
      </ToolbarButton>
      <span className="ms-auto">
        <EmojiButton onSelect={(emoji) => editor.chain().focus().insertContent(emoji).run()} />
      </span>
    </div>
  );
}

export default function RichTextEditor({
  defaultValue,
  onChange,
  labelId,
  dir,
  lang,
}: RichTextEditorProps) {
  const editor = useEditor({
    // Rendered in the browser only (loaded with next/dynamic, ssr: false).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url) => SAFE_LINK.test(url),
        },
      }),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        dir,
        lang,
        class:
          "min-h-40 px-3 py-2 outline-none [&_blockquote]:border-s-4 [&_blockquote]:ps-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:ps-6 [&_a]:text-primary [&_a]:underline",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });

  return (
    <div className="rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      {editor ? <Toolbar editor={editor} labelId={labelId} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
