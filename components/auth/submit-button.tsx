import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Full-width submit button that shows progress and blocks double submits. */
export function SubmitButton({
  pending,
  children,
  variant = "default",
}: {
  pending: boolean;
  children: ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <Button
      type="submit"
      size="lg"
      variant={variant}
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
