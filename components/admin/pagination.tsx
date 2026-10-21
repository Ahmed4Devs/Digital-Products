import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Href = ComponentProps<typeof Link>["href"];

/** Previous/next links for server-paginated admin tables. */
export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => Href;
}) {
  const t = useTranslations("admin.pagination");
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={t("label")} className="flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          className={buttonVariants({ variant: "outline" })}
        >
          <ChevronLeftIcon aria-hidden="true" className="rtl:-scale-x-100" />
          {t("previous")}
        </Link>
      ) : null}
      <p className="text-sm text-muted-foreground" aria-current="page">
        {t("pageStatus", { page, pageCount })}
      </p>
      {page < pageCount ? (
        <Link
          href={hrefFor(page + 1)}
          rel="next"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("next")}
          <ChevronRightIcon aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
      ) : null}
    </nav>
  );
}
