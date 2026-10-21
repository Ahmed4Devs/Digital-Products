import { IntlNamespaces } from "@/components/layout/intl-namespaces";
import { SiteShell } from "@/components/layout/site-shell";
import { requireCustomer } from "@/lib/auth/dal";

// Checked before anything streams, so guests get a real redirect (spec §6.3). Pages and
// data functions below re-check through the DAL; layouts alone are never trusted.
export const instant = false;

export default async function AccountLayout({ children }: LayoutProps<"/[locale]">) {
  await requireCustomer({ next: "/account" });

  return (
    <SiteShell>
      <IntlNamespaces namespaces={["auth", "account"]}>{children}</IntlNamespaces>
    </SiteShell>
  );
}
