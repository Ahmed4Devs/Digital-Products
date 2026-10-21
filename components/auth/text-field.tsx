import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps = ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
};

/**
 * Labelled input. Emails, passwords and usernames are always left-to-right, even on
 * Arabic pages (spec §7.2), so callers pass `dir="ltr"` for those.
 */
export function TextField({ id, label, hint, ...props }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hintId} {...props} />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
