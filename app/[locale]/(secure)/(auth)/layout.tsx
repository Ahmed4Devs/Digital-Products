import { IntlNamespaces } from "@/components/layout/intl-namespaces";
import { SiteShell } from "@/components/layout/site-shell";

/** Customer authentication pages: storefront chrome plus the `auth` messages. */
export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <SiteShell>
      <IntlNamespaces namespaces={["auth"]}>{children}</IntlNamespaces>
    </SiteShell>
  );
}
