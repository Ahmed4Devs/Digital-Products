import { z } from "zod";
import type { AuthErrorKey } from "./error-messages";

// Client-side checks for the auth forms, mirroring the server rules so customers get a
// translated message before a request is sent. Better Auth re-validates everything.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The raw password: never trimmed, since spaces are valid password characters. */
export function formPassword(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function checkEmail(email: string): AuthErrorKey | null {
  return emailSchema.safeParse(email).success ? null : "invalidEmail";
}

export function checkNewPassword(password: string): AuthErrorKey | null {
  const result = passwordSchema.safeParse(password);
  if (result.success) return null;
  return password.length < PASSWORD_MIN_LENGTH ? "passwordTooShort" : "passwordTooLong";
}
