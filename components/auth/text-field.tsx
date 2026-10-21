import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps = ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
  /** Translated validation message for this field. */
  error?: string;
};

/**
 * Labelled input. Emails, passwords and usernames are always left-to-right, even on
 * Arabic pages (spec §7.2), so callers pass `dir="ltr"` for those.
 */
export function TextField({ id, label, hint, error, ...props }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
