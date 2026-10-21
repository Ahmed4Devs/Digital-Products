import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { resetOwnerPassword, seedOwner } from "@/lib/auth/owner-account";

export const TEST_PASSWORD = "correct horse battery staple";

export const OWNER = {
  username: "owner",
  email: "owner@example.test",
  password: "owner horse battery staple",
  firstName: "Store",
  lastName: "Owner",
} as const;

const noBreachCheck = { isCompromised: async () => false };

/** A unique address, so tests never collide in the shared database or Mailpit. */
export function uniqueEmail(label = "customer"): string {
  return `${label}-${randomBytes(6).toString("hex")}@example.test`;
}

/** A unique documentation-range IP, so per-IP rate limits never leak between tests. */
export function uniqueIp(): string {
  const bytes = randomBytes(2);
  return `198.18.${bytes[0]}.${bytes[1]}`;
}

type CustomerOptions = {
  email?: string;
  verified?: boolean;
  banned?: boolean;
  password?: string;
  preferredLocale?: "ar" | "en";
};

/** Inserts a customer with a credential password, bypassing sign-up. */
export async function createCustomer(db: PrismaClient, options: CustomerOptions = {}) {
  const email = options.email ?? uniqueEmail();
  const user = await db.user.create({
    data: {
      email,
      name: email.split("@")[0]!,
      emailVerified: options.verified ?? true,
      banned: options.banned ?? false,
      preferredLocale: options.preferredLocale ?? "ar",
    },
  });
  await db.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(options.password ?? TEST_PASSWORD),
    },
  });
  return user;
}

/** The single owner, with a known password and no sessions. */
export async function ensureOwner(db: PrismaClient) {
  await seedOwner(
    db,
    {
      OWNER_USERNAME: OWNER.username,
      OWNER_EMAIL: OWNER.email,
      OWNER_PASSWORD: OWNER.password,
      OWNER_FIRST_NAME: OWNER.firstName,
      OWNER_LAST_NAME: OWNER.lastName,
    },
    noBreachCheck,
  );
  await resetOwnerPassword(db, OWNER.password, noBreachCheck);
  return db.user.findFirstOrThrow({ where: { role: "owner" } });
}
