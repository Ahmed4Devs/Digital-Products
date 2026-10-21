import { z } from "zod";
import { routing } from "@/i18n/routing";

// Customer account settings (spec §6.1). Messages are keys under `account.errors`.

const locale = z.enum(routing.locales);
const password = z.string({ error: "required" }).min(1, { error: "required" }).max(128);

export const changeEmailSchema = z.strictObject({
  locale,
  newEmail: z
    .string({ error: "required" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "invalidEmail" }).max(254, { error: "invalidEmail" })),
  password,
});

export const changePasswordSchema = z
  .strictObject({
    locale,
    currentPassword: password,
    newPassword: z
      .string({ error: "required" })
      .min(8, { error: "passwordTooShort" })
      .max(128, { error: "passwordTooLong" }),
    confirmPassword: z.string({ error: "required" }),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwordMismatch",
    when: (payload) => payload.issues.every((issue) => String(issue.path?.[0]) !== "newPassword"),
  });

export const deleteAccountSchema = z.strictObject({
  locale,
  password,
  confirm: z.literal("on", { error: "confirmRequired" }),
});
