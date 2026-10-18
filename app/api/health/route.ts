import { connection } from "next/server";
import { isDatabaseHealthy } from "@/lib/db/health";

/** Liveness + database readiness probe for local checks and container health checks. */
export async function GET(): Promise<Response> {
  // Always evaluate at request time; a prerendered health check would be meaningless.
  await connection();

  const databaseOk = await isDatabaseHealthy();
  const state = databaseOk ? "ok" : "unavailable";

  return Response.json(
    { status: state, checks: { database: state } },
    { status: databaseOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
