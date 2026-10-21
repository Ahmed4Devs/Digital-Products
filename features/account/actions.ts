"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import {
  actionFailure,
  ActionError,
  fieldErrorsFrom,
  formDataObject,
  type ActionState,
} from "@/lib/actions";
import { requireCustomer } from "@/lib/auth/dal";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/security/keyed-hash";
import { changeEmailSchema, changePasswordSchema, deleteAccountSchema } from "./schemas";
import { ACCOUNT_PASSWORD_LIMIT, deleteCustomerAccount } from "./service";

// Customer account settings (spec §6.1). Each action re-reads the session from the
// database, and every action that checks the password shares one per-account limit:
// server-side auth.api calls bypass Better Auth's HTTP rate limiter.

function apiErrorCode(error: unknown): string | undefined {
  if (!(error instanceof APIError)) return undefined;
  const body = error.body as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : undefined;
}

async function limitPasswordChecks(userId: string): Promise<void> {
  const { allowed } = await consumeRateLimit(
    getDb(),
    keyedHash(serverEnv().BETTER_AUTH_SECRET, "account-password", userId),
    ACCOUNT_PASSWORD_LIMIT,
  );
  if (!allowed) throw new ActionError("tooManyRequests");
}

async function verifyPassword(password: string, field: string): Promise<void> {
  try {
    await getAuth().api.verifyPassword({ body: { password }, headers: await headers() });
  } catch (error) {
    if (apiErrorCode(error) === "INVALID_PASSWORD") throw new ActionError("wrongPassword", field);
    throw error;
  }
}

function invalid(issues: { path: PropertyKey[]; message: string }[]): ActionState {
  return { status: "error", message: "invalid", fieldErrors: fieldErrorsFrom(issues) };
}

/**
 * Sends a confirmation link to the new address; the email changes only once that link
 * is opened (re-verification). The answer is the same whether or not the new address
 * already belongs to an account, so it never reveals who has one.
 */
export async function changeEmailAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireCustomer({ fresh: true });
  const parsed = changeEmailSchema.safeParse(formDataObject(formData));
  if (!parsed.success) return invalid(parsed.error.issues);
  const { locale, newEmail, password } = parsed.data;
  if (newEmail === user.email.toLowerCase()) {
    return { status: "error", message: "invalid", fieldErrors: { newEmail: "sameEmail" } };
  }
  try {
    await limitPasswordChecks(user.id);
    await verifyPassword(password, "password");
    await getAuth().api.changeEmail({
      body: { newEmail, callbackURL: `/${locale}/account?notice=email-changed` },
      headers: await headers(),
    });
    return { status: "success", message: "emailChangeSent" };
  } catch (error) {
    return accountFailure(error);
  }
}

/** Signs out every other device; this one gets a fresh session. */
export async function changePasswordAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireCustomer({ fresh: true });
  const parsed = changePasswordSchema.safeParse(formDataObject(formData));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    await limitPasswordChecks(user.id);
    await getAuth().api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
    return { status: "success", message: "passwordChanged" };
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === "INVALID_PASSWORD")
      return actionFailure(new ActionError("wrongPassword", "currentPassword"));
    if (code === "PASSWORD_COMPROMISED") {
      return actionFailure(new ActionError("passwordCompromised", "newPassword"));
    }
    if (code === "PASSWORD_TOO_SHORT")
      return actionFailure(new ActionError("passwordTooShort", "newPassword"));
    if (code === "PASSWORD_TOO_LONG")
      return actionFailure(new ActionError("passwordTooLong", "newPassword"));
    return accountFailure(error);
  }
}

/** Deletes the account after a password check, then clears this browser's cookies. */
export async function deleteAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireCustomer({ fresh: true });
  const parsed = deleteAccountSchema.safeParse(formDataObject(formData));
  if (!parsed.success) return invalid(parsed.error.issues);
  try {
    await limitPasswordChecks(user.id);
    await verifyPassword(parsed.data.password, "password");
    await deleteCustomerAccount(getDb(), user.id);
  } catch (error) {
    return accountFailure(error);
  }
  // The sessions are gone already; this only expires the cookies.
  await getAuth()
    .api.signOut({ headers: await headers() })
    .catch(() => undefined);
  return { status: "success", message: "accountDeleted" };
}

function accountFailure(error: unknown): ActionState {
  if (error instanceof APIError && error.statusCode === 429) {
    return { status: "error", message: "tooManyRequests" };
  }
  return actionFailure(error);
}
