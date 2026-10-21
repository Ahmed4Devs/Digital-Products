import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { consumeRateLimit, deleteStaleRateLimitBuckets } from "@/lib/rate-limit";

const db = getDb();
const rule = { windowSeconds: 60, max: 5 };

describe("consumeRateLimit (PostgreSQL)", () => {
  it("allows up to the limit, then reports when to retry", async () => {
    const key = randomUUID();
    const now = new Date("2026-10-21T10:00:00Z");
    for (let request = 0; request < 5; request += 1) {
      expect((await consumeRateLimit(db, key, rule, now)).allowed).toBe(true);
    }
    const later = new Date(now.getTime() + 15_000);
    expect(await consumeRateLimit(db, key, rule, later)).toEqual({
      allowed: false,
      retryAfterSeconds: 45,
    });
  });

  it("starts a new window once the old one has passed", async () => {
    const key = randomUUID();
    const now = new Date("2026-10-21T10:00:00Z");
    for (let request = 0; request < 6; request += 1) await consumeRateLimit(db, key, rule, now);
    const nextWindow = new Date(now.getTime() + 60_000);
    expect((await consumeRateLimit(db, key, rule, nextWindow)).allowed).toBe(true);
  });

  it("never lets concurrent requests exceed the limit", async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => consumeRateLimit(db, key, rule)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  it("deletes stale buckets only", async () => {
    const stale = randomUUID();
    const fresh = randomUUID();
    await consumeRateLimit(db, stale, rule, new Date("2020-01-01T00:00:00Z"));
    await consumeRateLimit(db, fresh, rule);

    await deleteStaleRateLimitBuckets(db, new Date(Date.now() - 24 * 60 * 60 * 1000));
    const keys = (
      await db.rateLimitBucket.findMany({ where: { key: { in: [stale, fresh] } } })
    ).map((bucket) => bucket.key);
    expect(keys).toEqual([fresh]);
  });
});
