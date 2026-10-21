"use client";

import { Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { removeFromCartAction } from "@/features/cart/actions";
import { useRouter } from "@/i18n/navigation";
import { announceCartChange } from "./cart-events";

export function RemoveFromCartButton({ productId, label }: { productId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeFromCartAction(productId);
          announceCartChange();
          router.refresh();
        })
      }
    >
      <Trash2Icon aria-hidden="true" />
    </Button>
  );
}
