"use client";

import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/auth/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { updateGatewaysAction } from "@/features/settings/actions";
import { useRouter } from "@/i18n/navigation";
import { ActionFeedback } from "./action-feedback";
import { useActionForm } from "./use-action-form";

export type GatewayOption = {
  id: "moyasar" | "paddle" | "paypal";
  configured: boolean;
  enabled: boolean;
};

/** Which configured gateways checkout offers. */
export function GatewaySettingsForm({ gateways }: { gateways: GatewayOption[] }) {
  const t = useTranslations("admin.settings");
  const router = useRouter();
  const { state, pending, onSubmit } = useActionForm(updateGatewaysAction, () => router.refresh());

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("gatewaysHint")}</p>
      <ul className="flex flex-col gap-3">
        {gateways.map((gateway) => (
          <li key={gateway.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`gateway-${gateway.id}`}
                name={`${gateway.id}Enabled`}
                defaultChecked={gateway.enabled}
                disabled={!gateway.configured}
              />
              <Label htmlFor={`gateway-${gateway.id}`}>{t(gateway.id)}</Label>
            </div>
            {!gateway.configured ? (
              <p className="ps-6 text-xs text-muted-foreground">{t("notConfigured")}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <ActionFeedback state={state} />
      <div className="sm:w-40">
        <SubmitButton pending={pending}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
