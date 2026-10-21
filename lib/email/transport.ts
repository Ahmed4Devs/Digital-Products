export type EmailAddress = { name?: string; email: string };

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailTransport {
  readonly name: "resend" | "mailpit";
  send(message: EmailMessage): Promise<void>;
}

/** Thrown when a provider rejects a message. Carries the HTTP status only, never content. */
export class EmailDeliveryError extends Error {
  override readonly name = "EmailDeliveryError";

  constructor(
    readonly transport: EmailTransport["name"],
    readonly status: number,
  ) {
    super(`${transport} rejected the message (HTTP ${status})`);
  }
}

const SEND_TIMEOUT_MS = 10_000;

/** Parses `Name <user@example.com>` or a bare address. */
export function parseAddress(value: string): EmailAddress {
  const match = /^\s*"?([^"<]*?)"?\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(value);
  if (match) {
    const [, name, email] = match;
    return name ? { name, email: email! } : { email: email! };
  }
  return { email: value.trim() };
}

/** Production transport: Resend's REST API (no SDK needed for one endpoint). */
export function createResendTransport(apiKey: string, from: string): EmailTransport {
  return {
    name: "resend",
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!response.ok) throw new EmailDeliveryError("resend", response.status);
    },
  };
}

/** Development and test transport: Mailpit's HTTP send API captures every message. */
export function createMailpitTransport(baseUrl: string, from: string): EmailTransport {
  const sender = parseAddress(from);
  return {
    name: "mailpit",
    async send(message) {
      const response = await fetch(new URL("/api/v1/send", baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: sender.email, Name: sender.name ?? "" },
          To: [{ Email: message.to }],
          Subject: message.subject,
          HTML: message.html,
          Text: message.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!response.ok) throw new EmailDeliveryError("mailpit", response.status);
    },
  };
}
