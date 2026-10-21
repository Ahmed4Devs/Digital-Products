import { beforeAll, describe, expect, it } from "vitest";
import {
  OwnerAccountError,
  resetOwnerPassword,
  seedOwner,
  seedStoreSettings,
} from "@/lib/auth/owner-account";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { callAuth } from "../../support/auth-client";
import { ensureOwner, OWNER, uniqueEmail } from "../../support/users";

// Owner provisioning (`pnpm db:seed`) and offline recovery (`pnpm owner:reset-password`).

const auth = getAuth();
const db = getDb();
const noBreachCheck = { isCompromised: async () => false };

function signInOwner(password: string) {
  return callAuth(auth, "/sign-in/username", { body: { username: OWNER.username, password } });
}

beforeAll(async () => {
  await ensureOwner(db);
});

describe("seedOwner", () => {
  it("is idempotent and never touches an existing owner", async () => {
    const before = await db.user.findFirstOrThrow({ where: { role: "owner" } });
    const result = await seedOwner(
      db,
      {
        OWNER_USERNAME: "someoneelse",
        OWNER_EMAIL: uniqueEmail("owner"),
        OWNER_PASSWORD: "another long password",
        OWNER_FIRST_NAME: "A",
        OWNER_LAST_NAME: "B",
      },
      noBreachCheck,
    );

    expect(result).toBe("exists");
    expect(await db.user.count({ where: { role: "owner" } })).toBe(1);
    const after = await db.user.findFirstOrThrow({ where: { role: "owner" } });
    expect(after).toEqual(before);
  });

  it("creates a verified owner whose username is stored lower-case", async () => {
    const owner = await db.user.findFirstOrThrow({ where: { role: "owner" } });
    expect(owner).toMatchObject({
      username: OWNER.username,
      email: OWNER.email,
      emailVerified: true,
      firstName: "Store",
      lastName: "Owner",
    });
  });

  it("makes a second owner impossible at the database level", async () => {
    await expect(
      db.user.create({ data: { email: uniqueEmail(), name: "x", role: "owner" } }),
    ).rejects.toThrow();
  });
});

describe("resetOwnerPassword", () => {
  it("sets a new password and revokes every owner session", async () => {
    const owner = await db.user.findFirstOrThrow({ where: { role: "owner" } });
    expect((await signInOwner(OWNER.password)).status).toBe(200);
    expect(await db.session.count({ where: { userId: owner.id } })).toBeGreaterThan(0);

    const newPassword = "recovered owner passphrase";
    const revoked = await resetOwnerPassword(db, newPassword, noBreachCheck);

    expect(revoked).toBeGreaterThan(0);
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
    expect((await signInOwner(OWNER.password)).status).toBe(401);
    expect((await signInOwner(newPassword)).status).toBe(200);

    await resetOwnerPassword(db, OWNER.password, noBreachCheck);
  });

  it("refuses short and compromised passwords", async () => {
    await expect(resetOwnerPassword(db, "short", noBreachCheck)).rejects.toBeInstanceOf(
      OwnerAccountError,
    );
    await expect(
      resetOwnerPassword(db, "password1234", { isCompromised: async () => true }),
    ).rejects.toThrow(/data breaches/);
    expect((await signInOwner(OWNER.password)).status).toBe(200);
  });
});

describe("seedStoreSettings", () => {
  it("creates the singleton with spec defaults and keeps later edits", async () => {
    await seedStoreSettings(db, { ar: "متجر", en: "Store" });
    const settings = await db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.usdToSarRate.toString()).toBe("3.75");
    expect(settings).toMatchObject({ taxEnabled: false, downloadsPerMinute: 5 });

    await db.storeSetting.update({ where: { id: 1 }, data: { downloadsPerMinute: 7 } });
    await seedStoreSettings(db, { ar: "متجر", en: "Store" });
    expect((await db.storeSetting.findUniqueOrThrow({ where: { id: 1 } })).downloadsPerMinute).toBe(
      7,
    );

    await expect(db.storeSetting.create({ data: { id: 2 } })).rejects.toThrow();
  });
});
