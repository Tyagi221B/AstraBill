/**
 * Product repository — the only place Drizzle queries for `products` live.
 * Every query scopes by `business_id` (tenant isolation). No business rules
 * here; purchasePrice redaction lives in the service layer.
 */
import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewProduct,
  type Product,
  businessMembers,
  products,
} from "../db/schema";

export async function insertProduct(
  tx: Tx,
  values: NewProduct,
): Promise<Product> {
  const [row] = await tx.insert(products).values(values).returning();
  if (!row) throw new Error("Insert product returned no row");
  return row;
}

/** Read one product by id, authorised through `business_members`. Returns
 *  null both for "doesn't exist" and "not a member" — no existence leak. */
export async function getProductForUser(
  userId: string,
  productId: string,
): Promise<Product | null> {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (!product) return null;

  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, product.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return null;
  return product;
}

export async function getProductForUserTx(
  tx: Tx,
  userId: string,
  productId: string,
): Promise<Product | null> {
  const [product] = await tx
    .select()
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (!product) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, product.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return null;
  return product;
}

export async function listProductsForUser(opts: {
  userId: string;
  businessId?: string;
  limit?: number;
}): Promise<Product[]> {
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
    inArray(products.businessId, memberBusinessIds),
    isNull(products.deletedAt),
  ];
  if (opts.businessId) whereParts.push(eq(products.businessId, opts.businessId));

  return db
    .select()
    .from(products)
    .where(and(...whereParts))
    .orderBy(desc(products.createdAt))
    .limit(opts.limit ?? 200);
}

/** Membership map for a user — used by the service to redact rows per business. */
export async function listUserRolesByBusiness(
  userId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      businessId: businessMembers.businessId,
      role: businessMembers.role,
    })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return new Map(rows.map((r) => [r.businessId, r.role]));
}

export interface ProductPatch {
  name?: string;
  hsnCode?: string | null;
  unit?: Product["unit"];
  gstRate?: string;
  purchasePrice?: string | null;
  sellingPrice?: string;
  stock?: string;
  lowStockThreshold?: string | null;
  isActive?: boolean;
}

export async function updateProduct(
  tx: Tx,
  productId: string,
  patch: ProductPatch,
): Promise<Product> {
  const [row] = await tx
    .update(products)
    .set(patch)
    .where(eq(products.id, productId))
    .returning();
  if (!row) throw new Error("Update product returned no row");
  return row;
}

export async function softDeleteProduct(
  tx: Tx,
  productId: string,
): Promise<void> {
  await tx
    .update(products)
    .set({ deletedAt: new Date() })
    .where(eq(products.id, productId));
}

/**
 * Atomically subtract `delta` from `products.stock`. Uses a SQL expression so
 * the read-modify-write happens server-side — no lost-update race even
 * outside a transaction. The service still calls this from inside the
 * finalise tx so the stock change rolls back together with the invoice.
 */
export async function decrementProductStock(
  tx: Tx,
  productId: string,
  delta: string,
): Promise<void> {
  await tx
    .update(products)
    .set({ stock: sql`${products.stock} - ${delta}::numeric` })
    .where(eq(products.id, productId));
}
