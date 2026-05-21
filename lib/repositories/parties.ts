/**
 * parties repository — replaces `customers` going forward. A party can be a
 * customer or a supplier; the type drives only the default UI CTA, not any
 * data semantic (see decision/full-ledger-pivot, party model shape).
 *
 * Every helper scopes by `business_id` (tenant isolation invariant). The
 * `*Tx` variants are for use inside an enclosing transaction.
 */
import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewParty,
  type Party,
  businessMembers,
  parties,
} from "../db/schema";

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
