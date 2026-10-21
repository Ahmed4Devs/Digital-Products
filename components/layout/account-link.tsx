"use client";

import { UserRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type SessionResponse = { user?: { role?: unknown } } | null;

/**
 * Header link to the account (signed-in customers) or to sign-in (everyone else).
 *
 * Resolved in the browser so catalog pages contain no request-time server work and stay
 * fully static (ensureStatic, spec §12). The server and first client render show the
 * guest link; a cheap session read (served from Better Auth's signed cookie cache)
 * swaps it for customers. The owner is never shown a link to the admin (spec §11).
 */
export function AccountLink() {
  const t = useTranslations("common.nav");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/get-session", { credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<SessionResponse>) : null))
      .then((session) => setSignedIn(session?.user?.role === "customer"))
      .catch(() => {
        // Aborted or offline: keep the guest link.
      });
    return () => controller.abort();
  }, []);

  return (
    <Link
      href={signedIn ? "/account" : "/sign-in"}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <UserRoundIcon aria-hidden="true" />
      {t(signedIn ? "account" : "signIn")}
    </Link>
  );
}
