import { describe, expect, it } from "vitest";
import { EnvValidationError, parseServerEnv, serverEnvSchema } from "@/lib/env/schema";

const devEnv = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://app:dev-secret@127.0.0.1:5462/app",
};

const prodEnv = {
  NODE_ENV: "production",
  APP_URL: "https://store.example.com",
  DATABASE_URL: "postgresql://app:prod-secret@db.example.com:5432/app?sslmode=verify-full",
};

function errorOf(source: Record<string, string | undefined>): string {
  try {
    parseServerEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return (error as Error).message;
  }
  throw new Error("expected parseServerEnv to throw");
}

describe("parseServerEnv", () => {
  it("accepts a valid development environment and applies defaults", () => {
    const env = parseServerEnv(devEnv);
    expect(env).toEqual({ ...devEnv, DATABASE_POOL_MAX: 10 });
  });

  it("defaults NODE_ENV to development", () => {
    const { NODE_ENV: _omit, ...rest } = devEnv;
    expect(parseServerEnv(rest).NODE_ENV).toBe("development");
  });

  it("coerces DATABASE_POOL_MAX and enforces its bounds", () => {
    expect(parseServerEnv({ ...devEnv, DATABASE_POOL_MAX: "25" }).DATABASE_POOL_MAX).toBe(25);
    expect(errorOf({ ...devEnv, DATABASE_POOL_MAX: "0" })).toContain("DATABASE_POOL_MAX");
    expect(errorOf({ ...devEnv, DATABASE_POOL_MAX: "1.5" })).toContain("DATABASE_POOL_MAX");
  });

  it("treats empty strings as unset", () => {
    expect(parseServerEnv({ ...devEnv, DATABASE_POOL_MAX: "" }).DATABASE_POOL_MAX).toBe(10);
    expect(errorOf({ ...devEnv, APP_URL: "" })).toContain("APP_URL: is required");
  });

  it("reports every missing variable at once", () => {
    const message = errorOf({ NODE_ENV: "development" });
    expect(message).toContain("APP_URL: is required");
    expect(message).toContain("DATABASE_URL: is required");
  });

  it("rejects malformed URLs and wrong protocols", () => {
    expect(errorOf({ ...devEnv, APP_URL: "ftp://localhost" })).toContain(
      "APP_URL: must be an http(s) URL",
    );
    expect(errorOf({ ...devEnv, DATABASE_URL: "mysql://u:p@localhost/db" })).toContain(
      "DATABASE_URL: must be a postgres:// or postgresql:// URL",
    );
    expect(errorOf({ ...devEnv, DATABASE_URL: "not a url" })).toContain("DATABASE_URL");
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(errorOf({ ...devEnv, NODE_ENV: "staging" })).toContain("NODE_ENV");
  });

  it("never echoes secret values in error messages", () => {
    const message = errorOf({ ...devEnv, NODE_ENV: "production", APP_URL: "http://shop.example" });
    expect(message).not.toContain("dev-secret");
    expect(message).not.toContain(devEnv.DATABASE_URL);
  });

  it("ignores unrelated environment variables", () => {
    const env = parseServerEnv({ ...devEnv, PATH: "/usr/bin", HOME: "/home/x" });
    expect(env).not.toHaveProperty("PATH");
  });
});

describe("production rules", () => {
  it("accepts https with a TLS database connection", () => {
    expect(parseServerEnv(prodEnv).NODE_ENV).toBe("production");
    for (const mode of ["require", "verify-ca", "verify-full"]) {
      const url = prodEnv.DATABASE_URL.replace("verify-full", mode);
      expect(() => parseServerEnv({ ...prodEnv, DATABASE_URL: url })).not.toThrow();
    }
  });

  it("requires https for APP_URL", () => {
    expect(errorOf({ ...prodEnv, APP_URL: "http://store.example.com" })).toContain(
      "APP_URL: must use https in production",
    );
  });

  it("requires a secure sslmode for DATABASE_URL", () => {
    const withoutTls = prodEnv.DATABASE_URL.replace("?sslmode=verify-full", "");
    expect(errorOf({ ...prodEnv, DATABASE_URL: withoutTls })).toContain(
      "DATABASE_URL: must set sslmode",
    );
    const weakTls = prodEnv.DATABASE_URL.replace("verify-full", "prefer");
    expect(errorOf({ ...prodEnv, DATABASE_URL: weakTls })).toContain(
      "DATABASE_URL: must set sslmode",
    );
  });

  it("allows a fully local production run (loopback app and database)", () => {
    const local = { ...devEnv, NODE_ENV: "production" };
    expect(() => parseServerEnv(local)).not.toThrow();
    expect(() =>
      parseServerEnv({
        ...local,
        APP_URL: "http://127.0.0.1:3100",
        DATABASE_URL: devEnv.DATABASE_URL.replace("127.0.0.1", "localhost"),
      }),
    ).not.toThrow();
  });

  it("does not exempt a loopback app that talks to a remote database", () => {
    const mixed = { ...prodEnv, APP_URL: "http://localhost:3000" };
    const message = errorOf({ ...mixed, DATABASE_URL: prodEnv.DATABASE_URL.split("?")[0] });
    expect(message).toContain("APP_URL: must use https in production");
    expect(message).toContain("DATABASE_URL: must set sslmode");
  });
});

describe("serverEnvSchema", () => {
  it("contains no NEXT_PUBLIC_ variables (they would be shipped to browsers)", () => {
    const keys = Object.keys(serverEnvSchema.shape);
    expect(keys.filter((key) => key.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });
});
