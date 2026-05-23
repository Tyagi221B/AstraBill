/**
 * party_custom_field_definitions + party_custom_field_values repository.
 *
 * Definitions are workspace-scoped (per business), partial-UQ'd by name,
 * soft-delete-aware. Values are per (party, definition) with a real UQ —
 * we always upsert.
 *
 * Tenant scoping happens in the service. This module is plain CRUD.
 */
import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewPartyCustomFieldDefinition,
  type PartyCustomFieldDefinition,
  type PartyCustomFieldValue,
  businessMembers,
  partyCustomFieldDefinitions,
  partyCustomFieldValues,
} from "../db/schema";

// --- Definitions ---------------------------------------------------------

export async function insertPartyCustomFieldDefTx(
  tx: Tx,
  values: NewPartyCustomFieldDefinition,
): Promise<PartyCustomFieldDefinition> {
  const [row] = await tx
    .insert(partyCustomFieldDefinitions)
    .values(values)
    .returning();
  if (!row) {
    throw new Error("Insert party_custom_field_definition returned no row");
  }
  return row;
}

export async function listPartyCustomFieldDefsForUser(opts: {
  userId: string;
  businessId: string;
}): Promise<PartyCustomFieldDefinition[]> {
  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, opts.businessId),
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return [];

  return db
    .select()
    .from(partyCustomFieldDefinitions)
    .where(
      and(
        eq(partyCustomFieldDefinitions.businessId, opts.businessId),
        isNull(partyCustomFieldDefinitions.deletedAt),
      ),
    )
    .orderBy(
      asc(partyCustomFieldDefinitions.sortOrder),
      asc(partyCustomFieldDefinitions.name),
    );
}

/** Unscoped — used by the party detail page to render values alongside
 *  their definition labels in one round trip. The caller (server
 *  component) is responsible for the membership check via the parent
 *  party. */
export async function listPartyCustomFieldDefsForBusiness(
  businessId: string,
): Promise<PartyCustomFieldDefinition[]> {
  return db
    .select()
    .from(partyCustomFieldDefinitions)
    .where(
      and(
        eq(partyCustomFieldDefinitions.businessId, businessId),
        isNull(partyCustomFieldDefinitions.deletedAt),
      ),
    )
    .orderBy(
      asc(partyCustomFieldDefinitions.sortOrder),
      asc(partyCustomFieldDefinitions.name),
    );
}

export async function getPartyCustomFieldDefForUserTx(
  tx: Tx,
  userId: string,
  defId: string,
): Promise<PartyCustomFieldDefinition | null> {
  const [def] = await tx
    .select()
    .from(partyCustomFieldDefinitions)
    .where(
      and(
        eq(partyCustomFieldDefinitions.id, defId),
        isNull(partyCustomFieldDefinitions.deletedAt),
      ),
    );
  if (!def) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, def.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? def : null;
}

export async function updatePartyCustomFieldDefTx(
  tx: Tx,
  defId: string,
  patch: { name?: string; sortOrder?: number },
): Promise<PartyCustomFieldDefinition> {
  const [row] = await tx
    .update(partyCustomFieldDefinitions)
    .set(patch)
    .where(eq(partyCustomFieldDefinitions.id, defId))
    .returning();
  if (!row) {
    throw new Error("Update party_custom_field_definition returned no row");
  }
  return row;
}

export async function softDeletePartyCustomFieldDefTx(
  tx: Tx,
  defId: string,
): Promise<void> {
  await tx
    .update(partyCustomFieldDefinitions)
    .set({ deletedAt: new Date() })
    .where(eq(partyCustomFieldDefinitions.id, defId));
}

// --- Values --------------------------------------------------------------

export async function listPartyCustomFieldValues(
  partyId: string,
): Promise<PartyCustomFieldValue[]> {
  return db
    .select()
    .from(partyCustomFieldValues)
    .where(eq(partyCustomFieldValues.partyId, partyId));
}

/**
 * Upsert one value row by (partyId, definitionId). Null or empty value
 * collapses to NULL in the column. Used by the party service inside the
 * create / update transaction.
 */
export async function upsertPartyCustomFieldValueTx(
  tx: Tx,
  opts: {
    businessId: string;
    partyId: string;
    definitionId: string;
    value: string | null;
  },
): Promise<PartyCustomFieldValue> {
  const value = opts.value && opts.value.trim() ? opts.value.trim() : null;
  const [row] = await tx
    .insert(partyCustomFieldValues)
    .values({
      businessId: opts.businessId,
      partyId: opts.partyId,
      definitionId: opts.definitionId,
      value,
    })
    .onConflictDoUpdate({
      target: [
        partyCustomFieldValues.partyId,
        partyCustomFieldValues.definitionId,
      ],
      set: { value },
    })
    .returning();
  if (!row) throw new Error("Upsert party_custom_field_value returned no row");
  return row;
}

/**
 * Filter a list of definition IDs to those that actually belong to the
 * business AND are not soft-deleted. Used by the party service to drop
 * stray definitionIds from a request before applying.
 */
export async function filterValidDefinitionIdsForBusinessTx(
  tx: Tx,
  businessId: string,
  defIds: string[],
): Promise<Set<string>> {
  if (defIds.length === 0) return new Set();
  const rows = await tx
    .select({ id: partyCustomFieldDefinitions.id })
    .from(partyCustomFieldDefinitions)
    .where(
      and(
        eq(partyCustomFieldDefinitions.businessId, businessId),
        inArray(partyCustomFieldDefinitions.id, defIds),
        isNull(partyCustomFieldDefinitions.deletedAt),
      ),
    );
  return new Set(rows.map((r) => r.id));
}
