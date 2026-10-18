import { parseServerEnv } from "@/lib/env/schema";

/**
 * Runs once when a Next.js server instance starts. Validating the environment here makes
 * a missing or malformed variable crash the server at boot instead of on first request.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Builds must not require runtime secrets (they are injected only at deploy time).
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  parseServerEnv(process.env);
}
