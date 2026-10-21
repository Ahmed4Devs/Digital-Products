import { describe, expect, it } from "vitest";
import { EnvValidationError, parseServerEnv, serverEnvSchema } from "@/lib/env/schema";

const devEnv = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://app:dev-secret@127.0.0.1:5462/app",
  BETTER_AUTH_SECRET: "dev-auth-secret-that-is-long-enough-123",
  MAIL_FROM: "Digital Store <no-reply@example.com>",
  MAILPIT_URL: "http://127.0.0.1:8032",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  S3_ENDPOINT: "http://127.0.0.1:9010",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "dev-access-key",
  S3_SECRET_ACCESS_KEY: "dev-storage-secret",
  S3_BUCKET_PRIVATE: "digital-products-files",
  S3_BUCKET_PUBLIC: "digital-products-media",
};

const prodEnv = {
  NODE_ENV: "production",
  APP_URL: "https://store.example.com",
  DATABASE_URL: "postgresql://app:prod-secret@db.example.com:5432/app?sslmode=verify-full",
  BETTER_AUTH_SECRET: "prod-auth-secret-that-is-long-enough-456",
  MAIL_FROM: "Digital Store <no-reply@store.example.com>",
  RESEND_API_KEY: "re_live_key",
  TURNSTILE_SITE_KEY: "0x4AAAAAAA",
  TURNSTILE_SECRET_KEY: "0x4AAAAAAA-secret",
  S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: "r2-access-key",
  S3_SECRET_ACCESS_KEY: "r2-storage-secret",
  S3_BUCKET_PRIVATE: "store-files",
  S3_BUCKET_PUBLIC: "store-media",
};

const defaults = {
  DATABASE_POOL_MAX: 10,
  AUTH_IP_HEADERS: ["x-forwarded-for"],
  AUTH_TRUSTED_PROXIES: [],
  TEST_DOUBLES: "off",
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
    expect(env).toEqual({ ...devEnv, ...defaults });
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
    expect(message).toContain("BETTER_AUTH_SECRET: is required");
    expect(message).toContain("MAIL_FROM: is required");
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
    expect(errorOf({ ...devEnv, S3_ENDPOINT: "not a url" })).not.toContain(
      devEnv.S3_SECRET_ACCESS_KEY,
    );
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

describe("authentication, email and bot protection", () => {
  it("requires a long auth secret", () => {
    expect(errorOf({ ...devEnv, BETTER_AUTH_SECRET: "too-short" })).toContain(
      "BETTER_AUTH_SECRET: must be at least 32 characters",
    );
  });

  it("parses comma-separated IP header and trusted proxy lists", () => {
    const env = parseServerEnv({
      ...devEnv,
      AUTH_IP_HEADERS: "cf-connecting-ip, x-forwarded-for",
      AUTH_TRUSTED_PROXIES: "10.0.0.0/8,  172.16.0.0/12 ,",
    });
    expect(env.AUTH_IP_HEADERS).toEqual(["cf-connecting-ip", "x-forwarded-for"]);
    expect(env.AUTH_TRUSTED_PROXIES).toEqual(["10.0.0.0/8", "172.16.0.0/12"]);
  });

  it("needs an email transport", () => {
    const { MAILPIT_URL: _omit, ...rest } = devEnv;
    expect(errorOf(rest)).toContain("RESEND_API_KEY: is required (or MAILPIT_URL");
  });

  it("requires Resend in production even when Mailpit is configured", () => {
    const { RESEND_API_KEY: _omit, ...rest } = prodEnv;
    expect(errorOf({ ...rest, MAILPIT_URL: "http://127.0.0.1:8032" })).toContain(
      "RESEND_API_KEY: is required in production",
    );
  });

  it("requires Turnstile keys unless test doubles are on", () => {
    const { TURNSTILE_SITE_KEY: _site, TURNSTILE_SECRET_KEY: _secret, ...rest } = devEnv;
    const message = errorOf(rest);
    expect(message).toContain("TURNSTILE_SITE_KEY: is required");
    expect(message).toContain("TURNSTILE_SECRET_KEY: is required");
    expect(parseServerEnv({ ...rest, TEST_DOUBLES: "on" }).TEST_DOUBLES).toBe("on");
  });

  it("refuses test doubles unless the app runs on loopback", () => {
    expect(errorOf({ ...prodEnv, TEST_DOUBLES: "on" })).toContain(
      "TEST_DOUBLES: can only be enabled when APP_URL is a loopback address",
    );
    expect(
      errorOf({ ...devEnv, APP_URL: "http://192.168.1.20:3000", TEST_DOUBLES: "on" }),
    ).toContain("TEST_DOUBLES");
    expect(errorOf({ ...devEnv, TEST_DOUBLES: "yes" })).toContain("TEST_DOUBLES");
  });
});

describe("object storage", () => {
  it("requires the endpoint, credentials and both buckets", () => {
    const message = errorOf({ NODE_ENV: "development" });
    for (const key of [
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_BUCKET_PRIVATE",
      "S3_BUCKET_PUBLIC",
    ]) {
      expect(message).toContain(`${key}: is required`);
    }
  });

  it("never lets product files share the public bucket", () => {
    expect(errorOf({ ...devEnv, S3_BUCKET_PUBLIC: devEnv.S3_BUCKET_PRIVATE })).toContain(
      "S3_BUCKET_PRIVATE: must differ from S3_BUCKET_PUBLIC",
    );
  });

  it("requires https storage in production, except for a fully local run", () => {
    expect(errorOf({ ...prodEnv, S3_ENDPOINT: "http://storage.example.com" })).toContain(
      "S3_ENDPOINT: must use https in production",
    );
    expect(() => parseServerEnv({ ...devEnv, NODE_ENV: "production" })).not.toThrow();
  });
});

describe("serverEnvSchema", () => {
  it("contains no NEXT_PUBLIC_ variables (they would be shipped to browsers)", () => {
    const keys = Object.keys(serverEnvSchema.shape);
    expect(keys.filter((key) => key.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });
});
