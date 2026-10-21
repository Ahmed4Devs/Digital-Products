"use client";

import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton({ redirectTo = "/" }: { redirectTo?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.replace(redirectTo);
          router.refresh();
        })
      }
    >
      <LogOutIcon aria-hidden="true" className="rtl:-scale-x-100" />
      {t("signOut")}
    </Button>
  );
}
