import { ArrowRightIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

type SectionHeadingProps = {
  id: string;
  title: string;
  link?: { href: string; label: string };
};

export function SectionHeading({ id, title, link }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {link ? (
        <Link
          href={link.href}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {link.label}
          <ArrowRightIcon aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </Link>
      ) : null}
    </div>
  );
}
