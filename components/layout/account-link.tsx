import { UserRoundIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/dal";

function AccountLinkView({ signedIn, label }: { signedIn: boolean; label: string }) {
  return (
    <Link
      href={signedIn ? "/account" : "/sign-in"}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <UserRoundIcon aria-hidden="true" />
      {label}
    </Link>
  );
}

/** Static fallback for the header slot: what every guest sees. */
export async function AccountLinkFallback() {
  const t = await getTranslations("account.nav");
  return <AccountLinkView signedIn={false} label={t("signIn")} />;
}

/**
 * Personal header UI, streamed behind a Suspense boundary so the rest of the page stays
 * in the static shell (spec §12). The owner has no customer area and is never shown a
 * link to the admin (spec §11).
 */
export async function AccountLink() {
  const [t, user] = await Promise.all([getTranslations("account.nav"), getSessionUser()]);
  const signedIn = user?.role === "customer";
  return <AccountLinkView signedIn={signedIn} label={t(signedIn ? "account" : "signIn")} />;
}
