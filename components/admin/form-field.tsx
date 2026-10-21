"use client";

import { useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { graphemeLength } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { EmojiButton } from "./emoji-button";
import { useActionMessages } from "./use-action-messages";

type FieldShellProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Label, control, hint, error and optional counter, wired up with ARIA ids. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  counter,
  children,
  className,
}: FieldShellProps) {
  const messages = useActionMessages();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {counter}
      </div>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {messages.error(error)}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  /** Shows a live grapheme counter against this limit. */
  maxGraphemes?: number;
  multiline?: boolean;
  /** Adds an emoji picker that inserts at the cursor. */
  emoji?: boolean;
};

/** A labelled text input or textarea with validation message and character counter. */
export function TextField({
  label,
  hint,
  error,
  maxGraphemes,
  multiline,
  emoji,
  defaultValue,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  const t = useTranslations("admin.productForm");
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [count, setCount] = useState(() => graphemeLength(String(defaultValue ?? "")));

  function insert(text: string) {
    const element = ref.current;
    if (!element) return;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    element.setRangeText(text, start, end, "end");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.focus();
  }

  const shared = {
    id,
    ref,
    defaultValue,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, hint, error),
    onInput: (event: { currentTarget: { value: string } }) =>
      setCount(graphemeLength(event.currentTarget.value)),
  };

  const counter =
    maxGraphemes !== undefined ? (
      <span
        className={cn(
          "text-xs tabular-nums text-muted-foreground",
          count > maxGraphemes && "font-medium text-destructive",
        )}
        dir="ltr"
      >
        {t("characters", { count, max: maxGraphemes })}
      </span>
    ) : null;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      counter={counter}
      className={className}
    >
      <div className="flex items-start gap-2">
        {multiline ? (
          <Textarea {...shared} {...(props as ComponentProps<"textarea">)} rows={3} />
        ) : (
          <Input {...shared} {...props} />
        )}
        {emoji ? <EmojiButton onSelect={insert} /> : null}
      </div>
    </FieldShell>
  );
}
