import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackgroundTasks } from "@/lib/auth/background";
import { createAuth } from "@/lib/auth/server";
import { serverEnv } from "@/lib/env/server";
import { callAuth } from "../../support/auth-client";
import { TEST_PASSWORD, uniqueEmail } from "../../support/users";

// With TEST_DOUBLES off, sign-up goes through the real Turnstile and Have I Been Pwned
// plugins. Their HTTP calls are answered by stubs here, so no live service is contacted.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PWNED_RANGE = "https://api.pwnedpasswords.com/range/";

const auth = createAuth({
  ...serverEnv(),
  TEST_DOUBLES: "off",
  TURNSTILE_SITE_KEY: "test-site-key",
  TURNSTILE_SECRET_KEY: "test-secret-key",
});

const realFetch = globalThis.fetch;
let turnstileSuccess: boolean;
let breachedPasswords: Set<string>;
let externalCalls: string[];

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex").toUpperCase();
}

beforeEach(() => {
  turnstileSuccess = true;
  breachedPasswords = new Set();
  externalCalls = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(SITEVERIFY)) {
      externalCalls.push(url);
      const body = JSON.parse(String(init?.body)) as { secret: string; response: string };
      const ok =
        turnstileSuccess && body.secret === "test-secret-key" && body.response === "widget";
      return Response.json({ success: ok, "error-codes": ok ? [] : ["invalid-input-response"] });
    }
    if (url.startsWith(PWNED_RANGE)) {
      externalCalls.push(url);
      const prefix = url.slice(PWNED_RANGE.length);
      const lines = [...breachedPasswords]
        .map(sha1)
        .filter((hash) => hash.startsWith(prefix))
        .map((hash) => `${hash.slice(5)}:42`);
      return new Response([...lines, "0000000000000000000000000000000000A:0"].join("\r\n"));
    }
    return realFetch(input, init);
  });
});

afterEach(async () => {
  await settleBackgroundTasks();
  vi.unstubAllGlobals();
});

function signUp(password: string, captcha?: string) {
  return callAuth(auth, "/sign-up/email", {
    body: { email: uniqueEmail("external"), password, name: "" },
    headers:
      captcha === undefined ? { "x-captcha-response": "" } : { "x-captcha-response": captcha },
  });
}

describe("Cloudflare Turnstile on sign-up", () => {
  it("requires the widget token", async () => {
    const response = await signUp(TEST_PASSWORD);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "MISSING_RESPONSE" });
    expect(externalCalls).toHaveLength(0);
  });

  it("rejects a token Cloudflare does not confirm", async () => {
    turnstileSuccess = false;
    const response = await signUp(TEST_PASSWORD, "widget");
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "VERIFICATION_FAILED" });
  });

  it("accepts a confirmed token, verified server-side with the secret key", async () => {
    const response = await signUp(TEST_PASSWORD, "widget");
    expect(response.status).toBe(200);
    expect(externalCalls.some((url) => url.startsWith(SITEVERIFY))).toBe(true);
  });

  it("only guards sign-up", async () => {
    const response = await callAuth(auth, "/sign-in/email", {
      body: { email: uniqueEmail(), password: TEST_PASSWORD },
    });
    expect(response.status).toBe(401);
    expect(externalCalls).toHaveLength(0);
  });
});

describe("compromised-password check", () => {
  it("rejects a password found in breaches, sending only a hash prefix", async () => {
    const breached = "password1234";
    breachedPasswords.add(breached);
    const response = await signUp(breached, "widget");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    const rangeCall = externalCalls.find((url) => url.startsWith(PWNED_RANGE));
    expect(rangeCall).toBe(`${PWNED_RANGE}${sha1(breached).slice(0, 5)}`);
    expect(rangeCall).not.toContain(breached);
  });

  it("accepts a password that is not in the corpus", async () => {
    breachedPasswords.add("password1234");
    const response = await signUp(TEST_PASSWORD, "widget");
    expect(response.status).toBe(200);
  });
});
