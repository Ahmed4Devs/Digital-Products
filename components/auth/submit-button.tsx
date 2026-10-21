import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Full-width submit button that shows progress and blocks double submits. */
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
