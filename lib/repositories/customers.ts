/**
 * Customer repository — the only place Drizzle queries for `customers` live.
 * Every query scopes by `business_id` (tenant isolation invariant). No
 * business rules here.
 */
import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type Customer,
  type NewCustomer,
  businessMembers,
  customers,
} from "../db/schema";

export async function insertCustomer(
  tx: Tx,
  values: NewCustomer,
): Promise<Customer> {
  const [row] = await tx.insert(customers).values(values).returning();
  if (!row) throw new Error("Insert customer returned no row");
  return row;
}

/**
 * Fetch one customer by id, authorised through the caller's `business_members`
 * row. Returns null both for "not found" and "no membership" so existence
 * isn't leaked to non-members.
 */
export async function getCustomerForUser(
  userId: string,
  customerId: string,
): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
  if (!customer) return null;

  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, customer.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return null;
  return customer;
}

/** Transaction-bound variant — used by update/delete inside their own tx. */
export async function getCustomerForUserTx(
  tx: Tx,
  userId: string,
  customerId: string,
): Promise<Customer | null> {
  const [customer] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
  if (!customer) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, customer.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return null;
  return customer;
}

/**
 * List customers the user can see — scoped to every business they're an
 * active member of, sorted newest-first. Filter by `businessId` for one
 * specific business (must be one of theirs, else empty — no existence leak).
 */
export async function listCustomersForUser(opts: {
  userId: string;
  businessId?: string;
  limit?: number;
}): Promise<Customer[]> {
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
    inArray(customers.businessId, memberBusinessIds),
    isNull(customers.deletedAt),
  ];
  if (opts.businessId) whereParts.push(eq(customers.businessId, opts.businessId));

  return db
    .select()
    .from(customers)
    .where(and(...whereParts))
    .orderBy(desc(customers.createdAt))
    .limit(opts.limit ?? 100);
}

export interface CustomerPatch {
  name?: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  notes?: string | null;
}

export async function updateCustomer(
  tx: Tx,
  customerId: string,
  patch: CustomerPatch,
): Promise<Customer> {
  const [row] = await tx
    .update(customers)
    .set(patch)
    .where(eq(customers.id, customerId))
    .returning();
  if (!row) throw new Error("Update customer returned no row");
  return row;
}

/** Soft-delete — invoices keep their customerId snapshot via `set null`
 *  semantics on the FK; the row is retained for audit. */
export async function softDeleteCustomer(
  tx: Tx,
  customerId: string,
): Promise<void> {
  await tx
    .update(customers)
    .set({ deletedAt: new Date() })
    .where(eq(customers.id, customerId));
}
