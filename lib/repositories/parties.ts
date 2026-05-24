/**
 * parties repository — replaces `customers` going forward. A party can be a
 * customer or a supplier; the type drives only the default UI CTA, not any
 * data semantic (see decision/full-ledger-pivot, party model shape).
 *
 * Every helper scopes by `business_id` (tenant isolation invariant). The
 * `*Tx` variants are for use inside an enclosing transaction.
 */
import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewParty,
  type Party,
  businessMembers,
  ledgerEntries,
  parties,
} from "../db/schema";

/** A party row with its computed running balance (debit − credit). Positive
 *  = party owes the business (receivable, "to collect"); negative = business
 *  owes party (payable, "to pay"); zero = settled. */
export type PartyWithBalance = Party & { balance: string };

export async function insertPartyTx(
  tx: Tx,
  values: NewParty,
): Promise<Party> {
  const [row] = await tx.insert(parties).values(values).returning();
  if (!row) throw new Error("Insert party returned no row");
  return row;
}

/**
 * Does this business already have a party with this exact name (active)?
 * Used by the createBusiness path to keep the "Cash Sale" auto-seed
 * idempotent.
 */
export async function businessHasPartyNamedTx(
  tx: Tx,
  businessId: string,
  name: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: parties.id })
    .from(parties)
    .where(
      and(
        eq(parties.businessId, businessId),
        eq(parties.name, name),
        isNull(parties.deletedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function getPartyForUser(
  userId: string,
  partyId: string,
): Promise<Party | null> {
  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), isNull(parties.deletedAt)));
  if (!party) return null;

  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, party.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? party : null;
}

/** Transaction-bound variant — used by update/delete inside their own tx. */
export async function getPartyForUserTx(
  tx: Tx,
  userId: string,
  partyId: string,
): Promise<Party | null> {
  const [party] = await tx
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), isNull(parties.deletedAt)));
  if (!party) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, party.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? party : null;
}

export async function listPartiesForUser(opts: {
  userId: string;
  businessId?: string;
  type?: Party["type"];
  limit?: number;
}): Promise<Party[]> {
  const memberBusinessIds = db
    .select({ id: businessMembers.businessId })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );

  const whereParts = [
    inArray(parties.businessId, memberBusinessIds),
    isNull(parties.deletedAt),
  ];
  if (opts.businessId) whereParts.push(eq(parties.businessId, opts.businessId));
  if (opts.type) whereParts.push(eq(parties.type, opts.type));

  return db
    .select()
    .from(parties)
    .where(and(...whereParts))
    .orderBy(desc(parties.createdAt))
    .limit(opts.limit ?? 200);
}

/**
 * Same as `listPartiesForUser`, plus each row carries a `balance` string
 * (debit minus credit) computed from non-reversed `ledger_entries` rows.
 * Used by the party picker on document create/edit so the user can see
 * which parties owe them money before picking one.
 */
export async function listPartiesWithBalanceForUser(opts: {
  userId: string;
  businessId: string;
  type?: Party["type"];
  limit?: number;
}): Promise<PartyWithBalance[]> {
  const memberBusinessIds = db
    .select({ id: businessMembers.businessId })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );

  const whereParts = [
    inArray(parties.businessId, memberBusinessIds),
    eq(parties.businessId, opts.businessId),
    isNull(parties.deletedAt),
  ];
  if (opts.type) whereParts.push(eq(parties.type, opts.type));

  const balanceExpr = sql<string>`COALESCE(SUM(${ledgerEntries.debitAmount}), 0) - COALESCE(SUM(${ledgerEntries.creditAmount}), 0)`;

  const rows = await db
    .select({
      party: parties,
      balance: balanceExpr,
    })
    .from(parties)
    .leftJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.partyId, parties.id),
        isNull(ledgerEntries.reversedByLedgerEntryId),
      ),
    )
    .where(and(...whereParts))
    .groupBy(parties.id)
    .orderBy(desc(parties.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({ ...r.party, balance: r.balance ?? "0" }));
}

export interface PartyPatch {
  type?: Party["type"];
  name?: string;
  mobileNumber?: string | null;
  email?: string | null;
  gstin?: string | null;
  panNumber?: string | null;
  categoryId?: string | null;
  creditPeriodDays?: number;
  creditLimit?: string;
  contactPersonName?: string | null;
  contactPersonDob?: string | null;
  notes?: string | null;
}

export async function updatePartyTx(
  tx: Tx,
  partyId: string,
  patch: PartyPatch,
): Promise<Party> {
  const [row] = await tx
    .update(parties)
    .set(patch)
    .where(eq(parties.id, partyId))
    .returning();
  if (!row) throw new Error("Update party returned no row");
  return row;
}

export async function softDeletePartyTx(
  tx: Tx,
  partyId: string,
): Promise<void> {
  await tx
    .update(parties)
    .set({ deletedAt: new Date() })
    .where(eq(parties.id, partyId));
}

/**
 * Unscoped fetch by id — no membership check. Reserved for share-token paths
 * where the token has already authorised the read. DO NOT use elsewhere.
 */
export async function findPartyById(partyId: string): Promise<Party | null> {
  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), isNull(parties.deletedAt)));
  return party ?? null;
}
