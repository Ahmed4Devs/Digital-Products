import { ChevronRightIcon } from "lucide-react";
import { Fragment } from "react";
import { EmojiText } from "@/components/shared/emoji-text";
import { Link } from "@/i18n/navigation";

type Crumb = { label: string; href?: string };

export function Breadcrumbs({ label, items }: { label: string; items: Crumb[] }) {
  return (
    <nav aria-label={label} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <Fragment key={`${index}-${item.label}`}>
            {index > 0 ? (
              <li aria-hidden="true">
                <ChevronRightIcon className="size-4 rtl:-scale-x-100" />
              </li>
            ) : null}
            <li>
              {item.href ? (
                <Link
                  href={item.href}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  <EmojiText text={item.label} />
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  <EmojiText text={item.label} />
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
