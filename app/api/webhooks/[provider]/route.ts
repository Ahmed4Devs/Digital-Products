import { handleWebhook } from "@/features/checkout/webhooks";
import { getDb } from "@/lib/db";
import { configuredProviders } from "@/lib/payments";
import type { ProviderId } from "@/lib/payments/types";

// One endpoint per gateway (spec §8.3). The body is read raw: signatures cover the exact
// bytes. Answers quickly; 401 for anything not genuine, 500 when the provider's API
// could not be reached so the provider retries.

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/[provider]">) {
  const { provider: id } = await params;
  const provider = configuredProviders().get(id as ProviderId);
  if (!provider) return Response.json({ error: "not_found" }, { status: 404 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES)
    return Response.json({ error: "too_large" }, { status: 413 });

  try {
    const result = await handleWebhook(getDb(), provider, { rawBody, headers: request.headers });
    return Response.json(
      { received: result.status === 200, outcome: result.outcome },
      { status: result.status },
    );
  } catch (error) {
    console.error(
      `Webhook processing failed (${provider.id})`,
      error instanceof Error ? error.name : "unknown",
    );
    return Response.json({ error: "retry" }, { status: 500 });
  }
}
