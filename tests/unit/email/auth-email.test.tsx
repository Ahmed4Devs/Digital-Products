import { render } from "react-email";
import { describe, expect, it } from "vitest";
import { AuthEmail, authEmailSubject, type AuthEmailKind } from "@/emails/auth-email";

const KINDS: AuthEmailKind[] = ["verifyEmail", "magicLink", "resetPassword"];
const url = "https://store.example.com/api/auth/verify-email?token=abc.def&callbackURL=%2Far";

describe.each(KINDS)("%s email", (kind) => {
  it("renders Arabic right-to-left with the link", async () => {
    const html = await render(<AuthEmail kind={kind} locale="ar" url={url} />);
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(url.replaceAll("&", "&amp;"));
    expect(html).not.toContain("/twemoji/");
  });

  it("renders English left-to-right with a plain-text alternative", async () => {
    const element = <AuthEmail kind={kind} locale="en" url={url} />;
    const html = await render(element);
    const text = await render(element, { plainText: true });
    expect(html).toContain('dir="ltr"');
    expect(text).toContain(url);
  });

  it("has a subject in both languages that names the store", () => {
    expect(authEmailSubject(kind, "ar")).toContain("المتجر الرقمي");
    expect(authEmailSubject(kind, "en")).toContain("Digital Store");
  });
});
