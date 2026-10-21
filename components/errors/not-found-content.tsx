import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** The translated 404 page body, shared by both root layouts. */
export async function NotFoundContent() {
  const t = await getTranslations("common.notFound");
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-medium text-muted-foreground">{t("code")}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonVariants()}>
          {t("home")}
        </Link>
        <Link href="/products" className={buttonVariants({ variant: "outline" })}>
          {t("products")}
        </Link>
      </div>
    </section>
  );
}
