import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const VARIANTS = {
  published: "default",
  draft: "secondary",
  archived: "outline",
} as const;

export function ProductStatusBadge({ status }: { status: keyof typeof VARIANTS }) {
  const t = useTranslations("admin.status");
  return <Badge variant={VARIANTS[status]}>{t(status)}</Badge>;
}
