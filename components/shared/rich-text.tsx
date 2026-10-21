import { renderRichTextHtml } from "@/lib/rich-text/render";
import { cn } from "@/lib/utils";

type RichTextProps = {
  html: string;
  className?: string;
};

/**
 * Renders owner-written rich text. The HTML is re-sanitized with the allowlist right
 * here, so nothing unsanitized can reach the DOM (spec §5.1).
 */
export function RichText({ html, className }: RichTextProps) {
  return (
    <div
      className={cn(
        "max-w-none leading-7 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-s-4 [&_blockquote]:ps-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-semibold [&_hr]:my-6 [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:my-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-6",
        className,
      )}
      // Safe: renderRichTextHtml sanitizes with an allowlist immediately before use.
      dangerouslySetInnerHTML={{ __html: renderRichTextHtml(html) }}
    />
  );
}
