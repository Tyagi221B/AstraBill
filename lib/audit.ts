/**
 * Audit log writer — invariant: every mutation that changes business data
 * writes one row here, **inside the same transaction** as the mutation. Audit
 * row and change commit together or neither does. No DB triggers.
 *
 * The action string is open-ended (`"invoice.create"`, `"payment.record"`,
 * `"auth.login"`, …) — the literal-union type below is just for autocomplete.
 */
import "server-only";

import type { Tx } from "./db";
import { auditLog } from "./db/schema";

/** Catalogue of known actions — kept open via `(string & {})` so a new action
 *  doesn't require an enum change, but autocomplete still surfaces the common
 *  ones. */
export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "user.update"
  | "business.create"
  | "business.update"
  | "business_member.invite"
  | "business_member.remove"
  | "customer.create"
  | "customer.update"
  | "customer.delete"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "invoice.finalize"
  | "invoice.send"
  | "payment.record"
  | "payment.delete"
  | "stock.adjust"
  | "whatsapp.send"
  // Allow ad-hoc actions without a type change:
  | (string & {});

export interface AuditEntryInput {
  action: AuditAction;
  /** Null for account-level events (e.g. `auth.login`). */
  businessId?: string | null;
  /** Null for system-initiated actions. */
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Structured before/after diff. Keep small — this column is jsonb. */
  changes?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Write one audit-log entry inside an existing transaction. Always pass the
 * tx — out-of-transaction audit writes are forbidden by design (they'd let
 * an audit row exist without the mutation, or vice versa).
 */
export async function writeAuditEntry(
  tx: Tx,
  input: AuditEntryInput,
): Promise<void> {
  await tx.insert(auditLog).values({
    action: input.action,
    businessId: input.businessId ?? null,
    actorUserId: input.actorUserId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    changes: input.changes ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}
