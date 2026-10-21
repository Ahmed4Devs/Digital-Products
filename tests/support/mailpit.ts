// Reads captured email from Mailpit's HTTP API (development and tests only).

type MailpitSummary = { ID: string; Subject: string; To: { Address: string }[] };
type MailpitMessage = { ID: string; Subject: string; HTML: string; Text: string };

function mailpitUrl(path: string): URL {
  const base = process.env.MAILPIT_URL;
  if (!base) throw new Error("MAILPIT_URL is required to read test email.");
  return new URL(path, base);
}

/** All messages sent to `to`, newest first. */
export async function listMessages(to: string): Promise<MailpitSummary[]> {
  const url = mailpitUrl("/api/v1/search");
  url.searchParams.set("query", `to:"${to}"`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mailpit search failed (${response.status})`);
  const data = (await response.json()) as { messages: MailpitSummary[] };
  return data.messages;
}

export async function getMessage(id: string): Promise<MailpitMessage> {
  const response = await fetch(mailpitUrl(`/api/v1/message/${id}`));
  if (!response.ok) throw new Error(`Mailpit message fetch failed (${response.status})`);
  return (await response.json()) as MailpitMessage;
}

/** Polls until `count` messages to `to` exist, then returns the newest one. */
export async function waitForMessage(
  to: string,
  { count = 1, timeoutMs = 10_000 }: { count?: number; timeoutMs?: number } = {},
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const messages = await listMessages(to);
    if (messages.length >= count && messages[0]) return getMessage(messages[0].ID);
    if (Date.now() > deadline) throw new Error(`No email for ${to} after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The first link in the plain-text body that points at `pathFragment`. */
export function extractLink(message: MailpitMessage, pathFragment: string): string {
  const link = message.Text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(pathFragment));
  if (!link) throw new Error(`No link containing ${pathFragment} in "${message.Subject}"`);
  return link.replace(/[)\]>.,]+$/, "");
}
