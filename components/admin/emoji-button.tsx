"use client";

import { SmileIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

function Loading() {
  const t = useTranslations("admin.emoji");
  return <p className="py-6 text-center text-muted-foreground">{t("loading")}</p>;
}

// Lazy: the grid's code is fetched the first time the picker opens (spec §7.6).
const EmojiGrid = dynamic(() => import("./emoji-grid"), { loading: Loading });

/** Opens the emoji picker and hands the chosen emoji to `onSelect`. */
export function EmojiButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const t = useTranslations("admin.emoji");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={t("open")}
            title={t("open")}
          />
        }
      >
        <SmileIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto">
        <PopoverTitle className="mb-2">{t("title")}</PopoverTitle>
        <EmojiGrid
          onSelect={(emoji) => {
            onSelect(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
