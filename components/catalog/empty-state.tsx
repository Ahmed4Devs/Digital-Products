import { SearchXIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <SearchXIcon aria-hidden="true" className="size-10 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}
