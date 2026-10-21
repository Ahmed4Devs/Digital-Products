import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

const validEnv = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://app:secret@127.0.0.1:5462/app",
  BETTER_AUTH_SECRET: "instrumentation-secret-long-enough-0001",
  MAIL_FROM: "store@example.com",
  MAILPIT_URL: "http://127.0.0.1:8032",
  TEST_DOUBLES: "on",
  S3_ENDPOINT: "http://127.0.0.1:9010",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "instrumentation-access-key",
  S3_SECRET_ACCESS_KEY: "instrumentation-storage-secret",
  S3_BUCKET_PRIVATE: "files",
  S3_BUCKET_PUBLIC: "media",
};

function stubEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

describe("instrumentation register()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails fast on the Node.js runtime when the environment is invalid", () => {
    stubEnv({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "", APP_URL: "", DATABASE_URL: "" });
    expect(() => register()).toThrow(/APP_URL: is required/);
  });

  it("accepts a valid environment", () => {
    stubEnv({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "", ...validEnv });
    expect(() => register()).not.toThrow();
  });

  it("skips validation during `next build`, which has no runtime secrets", () => {
    stubEnv({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build", APP_URL: "" });
    expect(() => register()).not.toThrow();
  });

  it("skips validation on the edge runtime", () => {
    stubEnv({ NEXT_RUNTIME: "edge", APP_URL: "" });
    expect(() => register()).not.toThrow();
  });
});
