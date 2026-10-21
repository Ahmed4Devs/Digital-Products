import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseServerEnv, serverEnvSchema } from "@/lib/env/schema";

// The committed environment templates stay complete, and the production one describes a
// configuration the server accepts in production.

function readTemplate(file: string) {
  const text = readFileSync(file, "utf8");
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]!] = match[2]!.replace(/^"(.*)"$/, "$1");
  }
  return { text, values };
}

const variables = [...Object.keys(serverEnvSchema.shape), "S3_PUBLIC_BASE_URL"];

// Set by Next.js and the image, or only by the test runners.
const NOT_IN_TEMPLATES = new Set(["NODE_ENV", "TEST_DOUBLES"]);
// Mailpit only captures mail on a developer's machine.
const LOCAL_ONLY = new Set(["MAILPIT_URL"]);

describe.each([
  [".env.example", false],
  [".env.production.example", true],
])("%s", (file, production) => {
  it("mentions every variable the server reads", () => {
    const { text } = readTemplate(file);
    for (const name of variables) {
      if (NOT_IN_TEMPLATES.has(name) || (production && LOCAL_ONLY.has(name))) continue;
      expect(text, name).toMatch(new RegExp(`^#?\\s*${name}=`, "m"));
    }
  });
});

describe(".env.production.example", () => {
  it("is accepted by the production checks, with TLS everywhere and no test doubles", () => {
    const { values } = readTemplate(".env.production.example");
    expect(values.TEST_DOUBLES).toBeUndefined();
    const env = parseServerEnv({ ...values, NODE_ENV: "production" });
    expect(new URL(env.APP_URL).protocol).toBe("https:");
    expect(new URL(env.S3_ENDPOINT).protocol).toBe("https:");
    expect(new URL(env.DATABASE_URL).searchParams.get("sslmode")).toBe("verify-full");
    expect(env.PADDLE_ENVIRONMENT).toBe("production");
    expect(env.PAYPAL_ENVIRONMENT).toBe("live");
  });
});
