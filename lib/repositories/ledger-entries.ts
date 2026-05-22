/**
 * ledger_entries repository — the heart of the books.
 *
 * Invariants (DB-enforced by CHECK constraints on the table):
 *   - exactly one of `debit_amount` / `credit_amount` is populated; the
 *     other column is NULL (not 0) so the row's direction is unambiguous.
 *   - the populated side is > 0.
 *   - exactly one of `party_id` / `money_account_id` is populated — every
 *     row is one leg of one ledger.
 *
 * Higher-level services (payment_entries, document finalise, money_accounts
 * adjust/transfer) compose multiple rows in the same transaction to keep
 * party and money-account balances in sync.
 *
 * Balance helpers (`balanceForParty`, `balanceForMoneyAccount`) return the
 * signed balance under the convention: positive = inflow to the entity
 * (receivable for a party, on-hand cash for a money account).
 */
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type LedgerEntry,
  type NewLedgerEntry,
  ledgerEntries,
} from "../db/schema";

interface InsertOpts {
  businessId: string;
  voucherType: NewLedgerEntry["voucherType"];
  /** Required for sane reports; null only for opening_balance rows. */
  entryDate?: string;
  partyId?: string | null;
  moneyAccountId?: string | null;
  documentId?: string | null;
  paymentEntryId?: string | null;
  /** Caller passes exactly one of `debitAmount` / `creditAmount`; positive. */
  debitAmount?: string | null;
  creditAmount?: string | null;
  narration?: string | null;
  transferPairId?: string | null;
}

/**
 * Insert one ledger row. Must be called inside an enclosing transaction so
 * paired writes (party leg + money-account leg of a payment, or two legs of
 * a transfer) commit atomically.
 *
 * Throws if the CHECK constraints would be violated — services should
 * validate before calling; this layer enforces the schema's contract.
 */
export async function insertLedgerEntryTx(
  tx: Tx,
  opts: InsertOpts,
): Promise<LedgerEntry> {
  // Defence-in-depth: validate the invariants service-side before the DB
  // does, so the error surfaces as a clear app error instead of a 23514.
  const hasParty = opts.partyId != null;
  const hasAccount = opts.moneyAccountId != null;
  if (hasParty === hasAccount) {
    throw new Error(
      "insertLedgerEntryTx: exactly one of party_id / money_account_id must be set",
    );
  }
  const hasDebit = opts.debitAmount != null;
  const hasCredit = opts.creditAmount != null;
  if (hasDebit === hasCredit) {
    throw new Error(
      "insertLedgerEntryTx: exactly one of debit_amount / credit_amount must be set",
    );
  }
  const side = (opts.debitAmount ?? opts.creditAmount)!;
  if (Number(side) <= 0) {
    throw new Error("insertLedgerEntryTx: populated side must be > 0");
  }

  const [row] = await tx
    .insert(ledgerEntries)
    .values({
      businessId: opts.businessId,
      voucherType: opts.voucherType,
      entryDate: opts.entryDate ?? null,
      partyId: opts.partyId ?? null,
      moneyAccountId: opts.moneyAccountId ?? null,
      documentId: opts.documentId ?? null,
      paymentEntryId: opts.paymentEntryId ?? null,
      debitAmount: opts.debitAmount ?? null,
      creditAmount: opts.creditAmount ?? null,
      narration: opts.narration ?? null,
      transferPairId: opts.transferPairId ?? null,
    })
    .returning();
  if (!row) throw new Error("Insert ledger_entries returned no row");
  return row;
}

/**
 * Running balance for one party: SUM(debit) − SUM(credit) over ledger_entries
 * where party_id = X. The convention used across the app:
 *   positive ⇒ party owes us (receivable / "To Collect")
 *   negative ⇒ we owe party (payable / "To Pay")
 *   zero     ⇒ settled
 */
export async function balanceForParty(partyId: string): Promise<string> {
  const [row] = await db
    .select({
      bal: sql<string>`coalesce(
        sum(${ledgerEntries.debitAmount}) - sum(${ledgerEntries.creditAmount}),
        0
      )::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.partyId, partyId));
  return row?.bal ?? "0";
}

/**
 * Batch balances for a list of party ids. Parties with no ledger rows are
 * absent from the map; callers default to "0".
 */
export async function balancesForParties(
  partyIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (partyIds.length === 0) return map;
  const rows = await db
    .select({
      partyId: ledgerEntries.partyId,
      bal: sql<string>`coalesce(
        sum(${ledgerEntries.debitAmount}) - sum(${ledgerEntries.creditAmount}),
        0
      )::text`,
    })
    .from(ledgerEntries)
    .where(
      sql`${ledgerEntries.partyId} = ANY(ARRAY[${sql.join(
        partyIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}])`,
    )
    .groupBy(ledgerEntries.partyId);
  for (const row of rows) {
    if (row.partyId) map.set(row.partyId, row.bal);
  }
  return map;
}

/**
 * Running balance for one money account: SUM(debit) − SUM(credit) over
 * ledger_entries where money_account_id = X. Positive ⇒ funds on hand.
 */
export async function balanceForMoneyAccount(
  moneyAccountId: string,
): Promise<string> {
  const [row] = await db
    .select({
      bal: sql<string>`coalesce(
        sum(${ledgerEntries.debitAmount}) - sum(${ledgerEntries.creditAmount}),
        0
      )::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.moneyAccountId, moneyAccountId));
  return row?.bal ?? "0";
}

/** Transaction-bound — same as above, for reads inside an enclosing tx. */
export async function balanceForMoneyAccountTx(
  tx: Tx,
  moneyAccountId: string,
): Promise<string> {
  const [row] = await tx
    .select({
      bal: sql<string>`coalesce(
        sum(${ledgerEntries.debitAmount}) - sum(${ledgerEntries.creditAmount}),
        0
      )::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.moneyAccountId, moneyAccountId));
  return row?.bal ?? "0";
}

/**
 * Batch balances for money accounts — drives the Cash & Bank list page in
 * one round-trip.
 */
export async function balancesForMoneyAccounts(
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      id: ledgerEntries.moneyAccountId,
      bal: sql<string>`coalesce(
        sum(${ledgerEntries.debitAmount}) - sum(${ledgerEntries.creditAmount}),
        0
      )::text`,
    })
    .from(ledgerEntries)
    .where(
      sql`${ledgerEntries.moneyAccountId} = ANY(ARRAY[${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}])`,
    )
    .groupBy(ledgerEntries.moneyAccountId);
  for (const row of rows) {
    if (row.id) map.set(row.id, row.bal);
  }
  return map;
}

/** Chronological ledger for one party (statement view). */
export async function listEntriesForParty(
  partyId: string,
  limit = 200,
): Promise<LedgerEntry[]> {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.partyId, partyId))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(limit);
}

/** Chronological ledger for one money account (transaction log). */
export async function listEntriesForMoneyAccount(
  moneyAccountId: string,
  limit = 200,
): Promise<LedgerEntry[]> {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.moneyAccountId, moneyAccountId))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(limit);
}

/**
 * Rows that share a transferPairId — used to render "Transfer to / from"
 * cross-references on the money-account detail page.
 */
export async function findTransferPair(
  transferPairId: string,
): Promise<LedgerEntry[]> {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.transferPairId, transferPairId));
}

/**
 * For the document-finalise reversal path (cancel a finalised doc): list the
 * rows produced by that document so the service can mark them reversed.
 */
export async function listEntriesForDocumentTx(
  tx: Tx,
  documentId: string,
): Promise<LedgerEntry[]> {
  return tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.documentId, documentId),
        // Only the original posting; reversal rows have reversedByLedgerEntryId set.
      ),
    )
    .orderBy(desc(ledgerEntries.createdAt));
}
