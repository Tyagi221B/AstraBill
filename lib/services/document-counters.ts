/**
 * document_counters service — FY-aware document numbering.
 *
 * Numbering happens at finalise (status: draft → unpaid), never at create.
 * The FY for the counter is derived from the document's `doc_date`, so
 * backdated documents land in the correct historical FY counter (a
 * backdated 2025-03-15 doc bumps FY 24-25, not the current FY).
 *
 * Sequence template tokens (lib/services/document-counters.ts is the SSOT
 * for the rendering rules):
 *   {PREFIX}  → the counter row's `prefix` column.
 *   {FY}      → fy_year (e.g. "26-27").
 *   {SEQ:N}   → zero-padded next_sequence to N digits (e.g. {SEQ:3} → "001").
 *
 * Default: "{PREFIX}{SEQ:3}". Owner-customisable per counter row.
 */
import "server-only";
import { and, eq } from "drizzle-orm";

import { db, type Tx } from "../db";
import { type DocTypeValue, documentCounters } from "../db/schema";
import { writeAuditEntry } from "../audit";
import { ForbiddenError, NotFoundError } from "../errors";
import { requirePermission } from "../rbac";
import { getBusinessForUserTx } from "../repositories/businesses";
import {
  incrementSequenceTx,
  listCountersForBusinessTx,
  lockOrCreateCounterTx,
} from "../repositories/document-counters";
import { type DocumentCounter } from "../db/schema";

/**
 * Indian-FY token from a calendar date + a configurable start month.
 * Default start month is April (4) — the statutory Indian FY.
 *
 *   docDate 2026-05-01, start=4 → FY 26-27 (current FY in May 2026)
 *   docDate 2027-03-31, start=4 → FY 26-27 (still in current FY before April)
 *   docDate 2027-04-01, start=4 → FY 27-28 (rollover)
 */
export function fyTokenFromDate(
  docDate: string,
  fyStartMonth: number,
): string {
  const [yStr, mStr] = docDate.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`fyTokenFromDate: invalid date ${docDate}`);
  }
  const startYear = month >= fyStartMonth ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

/**
 * Reserve the next document number for one (business, doc_type, doc_date).
 *
 * Locks the counter row with FOR UPDATE, formats the number, increments
 * `next_sequence`, returns. Must be called inside an enclosing transaction
 * (the lock releases on commit/rollback).
 */
export async function reserveNextNumberTx(
  tx: Tx,
  opts: {
    businessId: string;
    docType: DocTypeValue;
    docDate: string; // YYYY-MM-DD
    fyStartMonth: number; // from businesses.fyStartMonth
  },
): Promise<{ number: string; fyYear: string }> {
  const fyYear = fyTokenFromDate(opts.docDate, opts.fyStartMonth);
  const counter = await lockOrCreateCounterTx(tx, {
    businessId: opts.businessId,
    docType: opts.docType,
    fyYear,
  });
  const number = renderTemplate(counter.sequenceTemplate, {
    prefix: counter.prefix,
    fyYear,
    sequence: counter.nextSequence,
  });
  await incrementSequenceTx(tx, counter.id);
  return { number, fyYear };
}

/**
 * Render a `sequence_template` string with {PREFIX} / {FY} / {SEQ:N} tokens.
 *
 * Unknown tokens are left as-is (defensive — would surface to the owner as
 * "{XYZ}" in the rendered number, easy to spot and fix in settings).
 */
export function renderTemplate(
  template: string,
  ctx: { prefix: string; fyYear: string; sequence: number },
): string {
  return template
    .replace(/\{PREFIX\}/g, ctx.prefix)
    .replace(/\{FY\}/g, ctx.fyYear)
    .replace(/\{SEQ:(\d+)\}/g, (_match, n: string) =>
      String(ctx.sequence).padStart(Number(n), "0"),
    );
}

export interface CounterSeed {
  docType: DocTypeValue;
  startSequence: number;
  prefix?: string;
  sequenceTemplate?: string;
  resetEachFy?: boolean;
}

/**
 * Bulk-seed document_counters for the current FY (and ahead). Called by the
 * onboarding wizard. Idempotent — re-seeding the same (business, doc_type,
 * fy_year) overwrites prefix + template + nextSequence to the supplied
 * values.
 *
 * Refuses to seed below `next_sequence − 1` of an existing row when one
 * sequence is already issued for the current FY — that would risk
 * duplicate doc numbers (the partial UQ on `documents` catches it, but the
 * service is the friendly gate).
 */
/**
 * List the document_counter rows for one business, scoped by membership.
 * Read-only — used by the Invoice Settings page to render the current
 * per-doc-type prefix + sequence + reset-each-FY state for editing.
 *
 * Owner-only (`settings:edit`); a non-member 404s the same way as a stranger
 * — no existence leak.
 */
export async function listCountersForBusiness(opts: {
  businessId: string;
  actorUserId: string;
}): Promise<DocumentCounter[]> {
  await requirePermission(opts.actorUserId, opts.businessId, "settings:edit");
  return db.transaction(async (tx) => {
    const access = await getBusinessForUserTx(
      tx,
      opts.actorUserId,
      opts.businessId,
    );
    if (!access) throw new NotFoundError("Business not found");
    return listCountersForBusinessTx(tx, opts.businessId);
  });
}

export async function seedCountersForBusiness(opts: {
  businessId: string;
  actorUserId: string;
  seeds: CounterSeed[];
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await requirePermission(opts.actorUserId, opts.businessId, "settings:edit");

  await db.transaction(async (tx) => {
    const access = await getBusinessForUserTx(
      tx,
      opts.actorUserId,
      opts.businessId,
    );
    if (!access) throw new NotFoundError("Business not found");
    const business = access.business;
    const today = new Date().toISOString().slice(0, 10);
    const fyYear = fyTokenFromDate(today, business.fyStartMonth);

    for (const seed of opts.seeds) {
      const [existing] = await tx
        .select()
        .from(documentCounters)
        .where(
          and(
            eq(documentCounters.businessId, opts.businessId),
            eq(documentCounters.docType, seed.docType),
            eq(documentCounters.fyYear, fyYear),
          ),
        );
      if (existing) {
        if (seed.startSequence < existing.nextSequence) {
          throw new ForbiddenError(
            `Cannot reduce ${seed.docType} sequence below ${existing.nextSequence} — invoices already issued at higher numbers`,
          );
        }
        await tx
          .update(documentCounters)
          .set({
            prefix: seed.prefix ?? existing.prefix,
            sequenceTemplate:
              seed.sequenceTemplate ?? existing.sequenceTemplate,
            nextSequence: seed.startSequence,
            resetEachFy: seed.resetEachFy ?? existing.resetEachFy,
          })
          .where(eq(documentCounters.id, existing.id));
      } else {
        await tx.insert(documentCounters).values({
          businessId: opts.businessId,
          docType: seed.docType,
          fyYear,
          prefix: seed.prefix ?? "",
          sequenceTemplate: seed.sequenceTemplate ?? "{PREFIX}{SEQ:3}",
          nextSequence: seed.startSequence,
          resetEachFy: seed.resetEachFy ?? true,
        });
      }
    }

    await writeAuditEntry(tx, {
      action: "document_counters.seed",
      businessId: opts.businessId,
      actorUserId: opts.actorUserId,
      entityType: "business",
      entityId: opts.businessId,
      changes: { fyYear, seedCount: opts.seeds.length },
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    });
  });
}
