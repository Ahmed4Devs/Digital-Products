import { z } from "zod";
import { getSessionUser } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";

// Polled by the checkout result page. Read-only: it reports the state that webhooks set
// and never changes it (spec §10.1 step 7).

export async function GET(_request: Request, { params }: RouteContext<"/api/orders/[id]/status">) {
  const headers = { "cache-control": "no-store" };
  const { id } = await params;
  const orderId = z.uuid().safeParse(id);
  const user = await getSessionUser();
  if (!user || !orderId.success)
    return Response.json({ error: "not_found" }, { status: 404, headers });

  const order = await getDb().order.findFirst({
    where: { id: orderId.data, userId: user.id },
    select: { status: true },
  });
  if (!order) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json({ status: order.status }, { headers });
}
