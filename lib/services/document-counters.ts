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

import { type Tx } from "../db";
import type { DocTypeValue } from "../db/schema";
import {
  incrementSequenceTx,
  lockOrCreateCounterTx,
} from "../repositories/document-counters";

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
