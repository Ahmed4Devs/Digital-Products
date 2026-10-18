import "server-only";
import { getDb } from "./index";

const DEFAULT_TIMEOUT_MS = 2_000;

/** True when PostgreSQL answers a trivial query within the timeout. Never throws. */
export async function isDatabaseHealthy(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Database health check timed out")), timeoutMs);
  });

  try {
    await Promise.race([getDb().$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (error) {
    // Log the error class only: driver messages can include hostnames and user names.
    console.error(
      "[health] database check failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
