import "server-only";
import { parseServerEnv, type ServerEnv } from "./schema";

let cached: ServerEnv | undefined;

/**
 * Validated server environment. Parsed lazily so `next build` does not need runtime
 * secrets; instrumentation.ts calls it at server start so a bad config fails fast.
 */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
