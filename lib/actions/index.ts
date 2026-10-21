import { ZodError } from "zod";

// Shared shape of Server Action results for owner forms. Messages are translation keys
// (under `admin.errors` / `admin.notices`), never user-facing text, so forms translate
// them in the visitor's language.

export type ActionState = {
  status: "idle" | "success" | "error";
  /** Form-level message key. */
  message?: string;
  /** Field name → message key. */
  fieldErrors?: Record<string, string>;
  /** Id of the record an action created, for follow-up navigation. */
  id?: string;
};

export const IDLE: ActionState = { status: "idle" };

/** An expected, user-correctable failure. Anything else is logged and shown generically. */
export class ActionError extends Error {
  override readonly name = "ActionError";

  constructor(
    readonly messageKey: string,
    readonly field?: string,
  ) {
    super(messageKey);
  }
}

export function actionFailure(error: unknown): ActionState {
  if (error instanceof ActionError) {
    return error.field
      ? { status: "error", message: "invalid", fieldErrors: { [error.field]: error.messageKey } }
      : { status: "error", message: error.messageKey };
  }
  // Tampered ids or arguments that bypassed the form.
  if (error instanceof ZodError) return { status: "error", message: "invalid" };
  // Never echo internals to the browser (spec §5.1).
  console.error("Owner action failed", error);
  return { status: "error", message: "unexpected" };
}

/** Zod issues → the first message key per field. */
export function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}

/** FormData → plain object; repeated names become arrays. Files are dropped. */
export function formDataObject(formData: FormData): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return result;
}
