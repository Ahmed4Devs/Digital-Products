import type { Prisma } from "@/generated/prisma/client";

// Every owner mutation writes one AuditLog row with a before/after diff (spec §5.1, §11).

export type AuditValue = string | number | boolean | null;
export type AuditDiff = Record<string, { from: AuditValue; to: AuditValue }>;

type Snapshot = Record<string, unknown>;

/** JSON-safe form of a column value: dates as ISO strings, BigInt and Decimal as text. */
export function auditValue(value: unknown): AuditValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toFixed" in value && typeof value.toFixed === "function") {
    return String(value.toFixed());
  }
  return JSON.stringify(value);
}

/**
 * Fields whose values differ between two snapshots. A creation diffs against null
 * (every field from null), a deletion against null on the other side.
 */
export function auditDiff(before: Snapshot | null, after: Snapshot | null): AuditDiff {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: AuditDiff = {};
  for (const key of [...keys].sort()) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const from = auditValue(before?.[key]);
    const to = auditValue(after?.[key]);
    if (from !== to) diff[key] = { from, to };
  }
  return diff;
}

export type AuditEntry = {
  actorId: string;
  /** Dotted name, e.g. `product.update`. */
  action: string;
  entity: string;
  entityId: string | null;
  before?: Snapshot | null;
  after?: Snapshot | null;
  /** Extra context for actions that are not plain field changes (e.g. a reorder). */
  details?: Record<string, AuditValue | AuditValue[]>;
};

/** Writes the audit row inside the caller's transaction, so both commit together. */
export async function recordAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  const changes = auditDiff(entry.before ?? null, entry.after ?? null);
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      diff: entry.details ? { changes, details: entry.details } : { changes },
    },
  });
}
