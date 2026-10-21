"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { IDLE, type ActionState } from "@/lib/actions";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Runs a Server Action from a form without React's automatic form reset, so typed
 * values (and rich-text editor state) survive a validation error. `onSuccess` runs once
 * per successful submission, inside the same transition.
 */
export function useActionForm(action: FormAction, onSuccess?: (state: ActionState) => void) {
  const [state, dispatch, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.status === "success") onSuccess?.(next);
      return next;
    },
    IDLE,
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, onSubmit };
}
