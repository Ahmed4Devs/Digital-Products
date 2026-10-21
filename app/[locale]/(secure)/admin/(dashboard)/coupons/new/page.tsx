import type { Metadata } from "next";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CouponForm } from "@/components/admin/coupon-form";
import { Link } from "@/i18n/navigation";
import { requireOwner } from "@/lib/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.couponForm");
  return { title: t("createTitle") };
}

export default async function NewCouponPage() {
  await requireOwner();
  const t = await getTranslations("admin.couponForm");
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/coupons"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t("createTitle")}</h1>
      <CouponForm />
    </div>
  );
}
