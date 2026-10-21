"use client";

import { FormAlert } from "@/components/auth/form-alert";
import type { ActionState } from "@/lib/actions";
import { useActionMessages } from "./use-action-messages";

/** The form-level result of an owner action: an error alert or a success notice. */
export function ActionFeedback({ state, className }: { state: ActionState; className?: string }) {
  const messages = useActionMessages();
  if (state.status === "error") {
    return (
      <FormAlert tone="error" className={className}>
        {messages.error(state.message)}
      </FormAlert>
    );
  }
  if (state.status === "success") {
    const notice = messages.notice(state.message);
    return notice ? (
      <FormAlert tone="success" className={className}>
        {notice}
      </FormAlert>
    ) : null;
  }
  return null;
}
