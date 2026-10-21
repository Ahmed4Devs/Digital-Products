import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { AuditValue } from "@/lib/audit";

// The owner audit log (spec §11): every owner change with its time and diff, newest
// first. The page calls requireOwner() first.

export const AUDIT_ENTITIES = [
  "all",
  "product",
  "category",
  "order",
  "entitlement",
  "user",
  "coupon",
  "settings",
] as const;
export const AUDIT_PAGE_SIZE = 50;
/** Long values (legal page HTML) are cut for display; the full diff stays stored. */
export const AUDIT_VALUE_PREVIEW = 160;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const auditSearchSchema = z.object({
  entity: z.preprocess(firstValue, z.enum(AUDIT_ENTITIES).catch("all")),
  entityId: z.preprocess(firstValue, z.string().trim().max(64).catch("")),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000).catch(1)),
});

export type AuditSearch = z.infer<typeof auditSearchSchema>;

export function parseAuditSearch(params: Record<string, unknown>): AuditSearch {
  return auditSearchSchema.parse({
    entity: params.entity ?? "all",
    entityId: params.entityId ?? "",
    page: params.page ?? 1,
  });
}

export function auditSearchQuery(search: Partial<AuditSearch>): Record<string, string> {
  const query: Record<string, string> = {};
  if (search.entity && search.entity !== "all") query.entity = search.entity;
  if (search.entityId) query.entityId = search.entityId;
  if (search.page && search.page > 1) query.page = String(search.page);
  return query;
}

const changeSchema = z.object({ from: z.unknown(), to: z.unknown() });
const diffSchema = z.object({
  changes: z.record(z.string(), changeSchema).catch({}),
  details: z.record(z.string(), z.unknown()).optional().catch(undefined),
});

function preview(value: unknown): AuditValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const characters = Array.from(text);
  return characters.length > AUDIT_VALUE_PREVIEW
    ? `${characters.slice(0, AUDIT_VALUE_PREVIEW).join("")}…`
    : text;
}

/** The stored diff as display rows; anything malformed shows as no changes. */
export function auditRows(diff: unknown) {
  const parsed = diffSchema.safeParse(diff);
  if (!parsed.success) return { changes: [], details: [] };
  return {
    changes: Object.entries(parsed.data.changes).map(([field, change]) => ({
      field,
      from: preview(change.from),
      to: preview(change.to),
    })),
    details: Object.entries(parsed.data.details ?? {}).map(([field, value]) => ({
      field,
      value: preview(value),
    })),
  };
}

export async function findAuditLog(db: PrismaClient, search: AuditSearch) {
  const where: Prisma.AuditLogWhereInput = {};
  if (search.entity !== "all") where.entity = search.entity;
  if (search.entityId) where.entityId = search.entityId;
  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (search.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { actor: { select: { username: true, email: true } } },
    }),
  ]);
  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    entries: entries.map(({ diff, actor, ...entry }) => ({
      ...entry,
      actor: actor ? (actor.username ?? actor.email) : null,
      ...auditRows(diff),
    })),
  };
}
