import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

// Owner provisioning and offline recovery (spec §6.2, §17.5 §7). Used by CLI scripts
// that run on the server (`pnpm db:seed`, `pnpm owner:reset-password`), never by the web
// app, so there is no UI path that can create, promote or reset the owner.
//
// Passwords are hashed with Better Auth's own `hashPassword` (scrypt), the same function
// its email/password and username sign-in verify against.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** Better Auth's credential provider id; its account id is the user id. */
const CREDENTIAL_PROVIDER = "credential";

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `must be at least ${PASSWORD_MIN_LENGTH} characters` })
  .max(PASSWORD_MAX_LENGTH, { error: `must be at most ${PASSWORD_MAX_LENGTH} characters` });

export const ownerSeedSchema = z.object({
  OWNER_USERNAME: z
    .string()
    .regex(/^[a-zA-Z0-9_.]{3,32}$/, { error: "must be 3–32 letters, digits, '_' or '.'" }),
  OWNER_EMAIL: z.email(),
  OWNER_PASSWORD: passwordSchema,
  OWNER_FIRST_NAME: z.string().trim().min(1).max(100),
  OWNER_LAST_NAME: z.string().trim().min(1).max(100),
});

export type OwnerSeedInput = z.infer<typeof ownerSeedSchema>;

export type PasswordChecks = {
  /** Have I Been Pwned range check in production; a stub in tests. */
  isCompromised: (password: string) => Promise<boolean>;
};

export class OwnerAccountError extends Error {
  override readonly name = "OwnerAccountError";
}

async function assertUsablePassword(password: string, checks: PasswordChecks): Promise<void> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    throw new OwnerAccountError(`Password ${parsed.error.issues[0]?.message ?? "is invalid"}.`);
  }
  if (await checks.isCompromised(password)) {
    throw new OwnerAccountError(
      "This password appears in known data breaches. Choose a different one.",
    );
  }
}

/**
 * Creates the single owner account if none exists. Idempotent: an existing owner is
 * left untouched (use the recovery script to change its password).
 */
export async function seedOwner(
  db: PrismaClient,
  input: OwnerSeedInput,
  checks: PasswordChecks,
): Promise<"created" | "exists"> {
  const existingOwner = await db.user.findFirst({ where: { role: "owner" }, select: { id: true } });
  if (existingOwner) return "exists";

  const email = input.OWNER_EMAIL.toLowerCase();
  const username = input.OWNER_USERNAME.toLowerCase();
  const clash = await db.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });
  if (clash) {
    throw new OwnerAccountError(
      "OWNER_EMAIL or OWNER_USERNAME already belongs to another account.",
    );
  }

  await assertUsablePassword(input.OWNER_PASSWORD, checks);
  const passwordHash = await hashPassword(input.OWNER_PASSWORD);
  const firstName = input.OWNER_FIRST_NAME.trim();
  const lastName = input.OWNER_LAST_NAME.trim();

  await db.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        email,
        // The owner's email is for password recovery only and is verified by definition.
        emailVerified: true,
        name: `${firstName} ${lastName}`,
        role: "owner",
        username,
        firstName,
        lastName,
      },
      select: { id: true },
    });
    await tx.account.create({
      data: {
        userId: owner.id,
        providerId: CREDENTIAL_PROVIDER,
        accountId: owner.id,
        password: passwordHash,
      },
    });
  });
  return "created";
}

/**
 * Offline recovery: sets a new owner password and revokes every owner session.
 * Returns the number of sessions revoked.
 */
export async function resetOwnerPassword(
  db: PrismaClient,
  newPassword: string,
  checks: PasswordChecks,
): Promise<number> {
  const owner = await db.user.findFirst({ where: { role: "owner" }, select: { id: true } });
  if (!owner) throw new OwnerAccountError("No owner account exists. Run `pnpm db:seed` first.");

  await assertUsablePassword(newPassword, checks);
  const passwordHash = await hashPassword(newPassword);

  return db.$transaction(async (tx) => {
    await tx.account.upsert({
      where: {
        providerId_accountId: { providerId: CREDENTIAL_PROVIDER, accountId: owner.id },
      },
      update: { password: passwordHash },
      create: {
        userId: owner.id,
        providerId: CREDENTIAL_PROVIDER,
        accountId: owner.id,
        password: passwordHash,
      },
    });
    const { count } = await tx.session.deleteMany({ where: { userId: owner.id } });
    return count;
  });
}

/** Creates the singleton store settings row with its defaults if it is missing. */
export async function seedStoreSettings(
  db: PrismaClient,
  names: { ar: string; en: string },
): Promise<void> {
  await db.storeSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, storeNameAr: names.ar, storeNameEn: names.en },
  });
}
