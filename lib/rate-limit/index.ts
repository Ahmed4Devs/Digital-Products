import type { PrismaClient } from "@/generated/prisma/client";

export type RateLimitRule = {
  /** Length of the window in seconds. */
  windowSeconds: number;
  /** Requests allowed per window. */
  max: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window frees up; null when the request is allowed. */
  retryAfterSeconds: number | null;
};

type BucketRow = { count: number; window_started_at: Date };

/**
 * Counts one request against `key` in a fixed window and reports whether it is allowed.
 *
 * The check and the increment are a single `INSERT … ON CONFLICT DO UPDATE`, so
 * concurrent requests can never all pass on a stale read. PostgreSQL is the only store
 * (no Redis, spec §5.1). Callers must pass a hashed key (see lib/security/keyed-hash).
 */
export async function consumeRateLimit(
  db: PrismaClient,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(now.getTime() - rule.windowSeconds * 1_000);

  const [row] = await db.$queryRaw<BucketRow[]>`
    INSERT INTO "rate_limit_buckets" ("key", "count", "window_started_at")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "rate_limit_buckets"."window_started_at" <= ${windowStart} THEN 1
        ELSE "rate_limit_buckets"."count" + 1
      END,
      "window_started_at" = CASE
        WHEN "rate_limit_buckets"."window_started_at" <= ${windowStart} THEN ${now}
        ELSE "rate_limit_buckets"."window_started_at"
      END
    RETURNING "count", "window_started_at"
  `;

  if (!row) throw new Error("Rate limit upsert returned no row");
  if (row.count <= rule.max) return { allowed: true, retryAfterSeconds: null };

  const windowEndsAt = row.window_started_at.getTime() + rule.windowSeconds * 1_000;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - now.getTime()) / 1_000)),
  };
}

/** Deletes buckets whose window ended long ago. Called by the maintenance task. */
export async function deleteStaleRateLimitBuckets(
  db: PrismaClient,
  olderThan: Date,
): Promise<number> {
  const { count } = await db.rateLimitBucket.deleteMany({
    where: { windowStartedAt: { lt: olderThan } },
  });
  return count;
}
