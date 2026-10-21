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

const ORDER_VARIANTS = {
  paid: "default",
  pending: "secondary",
  failed: "destructive",
  refunded: "outline",
  expired: "outline",
} as const;

export function OrderStatusBadge({ status }: { status: keyof typeof ORDER_VARIANTS }) {
  const t = useTranslations("admin.orderStatus");
  return <Badge variant={ORDER_VARIANTS[status]}>{t(status)}</Badge>;
}

export function CustomerStatusBadge({
  customer,
}: {
  customer: { banned: boolean; emailVerified: boolean };
}) {
  const t = useTranslations("admin.customers.statuses");
  if (customer.banned) return <Badge variant="destructive">{t("banned")}</Badge>;
  if (!customer.emailVerified) return <Badge variant="secondary">{t("unverified")}</Badge>;
  return <Badge variant="outline">{t("active")}</Badge>;
}
