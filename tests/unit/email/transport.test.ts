import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMailpitTransport,
  createResendTransport,
  EmailDeliveryError,
  parseAddress,
} from "@/lib/email/transport";

const message = {
  to: "buyer@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
};

function stubFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: URL | string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseAddress", () => {
  it("splits a display name from the address", () => {
    expect(parseAddress("Digital Store <no-reply@example.com>")).toEqual({
      name: "Digital Store",
      email: "no-reply@example.com",
    });
    expect(parseAddress('"المتجر الرقمي" <store@example.com>')).toEqual({
      name: "المتجر الرقمي",
      email: "store@example.com",
    });
    expect(parseAddress(" store@example.com ")).toEqual({ email: "store@example.com" });
  });
});

describe("Resend transport", () => {
  it("posts the message with the API key", async () => {
    const calls = stubFetch();
    await createResendTransport("re_test", "Store <s@example.com>").send(message);

    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: "Store <s@example.com>",
      to: ["buyer@example.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("reports failures by status only", async () => {
    stubFetch(422);
    const error = await createResendTransport("re_test", "s@example.com")
      .send(message)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect((error as Error).message).toBe("resend rejected the message (HTTP 422)");
  });
});

describe("Mailpit transport", () => {
  it("uses Mailpit's send API", async () => {
    const calls = stubFetch();
    await createMailpitTransport("http://127.0.0.1:8032", "Store <s@example.com>").send(message);

    expect(calls[0]?.url).toBe("http://127.0.0.1:8032/api/v1/send");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      From: { Email: "s@example.com", Name: "Store" },
      To: [{ Email: "buyer@example.com" }],
      Subject: "Hello",
      HTML: "<p>Hi</p>",
      Text: "Hi",
    });
  });
});
