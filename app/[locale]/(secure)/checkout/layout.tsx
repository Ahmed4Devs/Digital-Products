import { IntlNamespaces } from "@/components/layout/intl-namespaces";
import { SiteShell } from "@/components/layout/site-shell";
import { requireCustomer } from "@/lib/auth/dal";

// Checked before anything streams, so guests get a real redirect to sign-in and come
// back here afterwards (spec §10.1 step 2). Every page and action re-checks.
export const instant = false;

export default async function CheckoutLayout({ children }: LayoutProps<"/[locale]">) {
  await requireCustomer({ next: "/checkout" });
  return (
    <SiteShell>
      <IntlNamespaces namespaces={["checkout"]}>{children}</IntlNamespaces>
    </SiteShell>
  );
}
