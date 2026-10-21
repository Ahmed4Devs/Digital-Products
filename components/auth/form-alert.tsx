import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormAlertProps = {
  tone: "error" | "success";
  children: ReactNode;
  className?: string;
};

/** Announced to screen readers: errors interrupt (`alert`), confirmations do not. */
export function FormAlert({ tone, children, className }: FormAlertProps) {
  const Icon = tone === "error" ? CircleAlertIcon : CircleCheckIcon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/30 bg-primary/10 text-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
