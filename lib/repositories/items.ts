/**
 * items repository — replaces `products` going forward. Tenant-scoped,
 * soft-delete-aware.
 *
 * Stock-on-hand is NOT a column here — current stock is computed from
 * `item_stock_movements`. Reads go through
 * `repositories/item-stock-movements.ts`.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type Item,
  type NewItem,
  businessMembers,
  stockMovements,
  items,
} from "../db/schema";

export async function insertItemTx(
  tx: Tx,
  values: NewItem,
): Promise<Item> {
  const [row] = await tx.insert(items).values(values).returning();
  if (!row) throw new Error("Insert item returned no row");
  return row;
}

export async function getItemForUser(
  userId: string,
  itemId: string,
): Promise<Item | null> {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), isNull(items.deletedAt)));
  if (!item) return null;

  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, item.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? item : null;
}

export async function getItemForUserTx(
  tx: Tx,
  userId: string,
  itemId: string,
): Promise<Item | null> {
  const [item] = await tx
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), isNull(items.deletedAt)));
  if (!item) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, item.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? item : null;
}

export async function listItemsForUser(opts: {
  userId: string;
  businessId?: string;
  type?: Item["type"];
  limit?: number;
}): Promise<Item[]> {
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
    inArray(items.businessId, memberBusinessIds),
    isNull(items.deletedAt),
  ];
  if (opts.businessId) whereParts.push(eq(items.businessId, opts.businessId));
  if (opts.type) whereParts.push(eq(items.type, opts.type));

  return db
    .select()
    .from(items)
    .where(and(...whereParts))
    .orderBy(desc(items.createdAt))
    .limit(opts.limit ?? 500);
}

export interface ItemPatch {
  type?: Item["type"];
  name?: string;
  categoryId?: string | null;
  code?: string | null;
  hsnSacCode?: string | null;
  measuringUnitCode?: string | null;
  alternativeUnitCode?: string | null;
  salesPrice?: string | null;
  salesPriceIncludesTax?: boolean;
  purchasePrice?: string | null;
  purchasePriceIncludesTax?: boolean;
  gstRate?: string | null;
  discountOnSalesPricePercent?: string | null;
  /**
   * NOTE: this column is the form-time input only. Current stock is computed
   * from `item_stock_movements` — editing this field does NOT retroactively
   * adjust on-hand stock. Adjust Stock is a separate action.
   */
  openingStock?: string | null;
  openingStockAsOfDate?: string | null;
  enableLowStockWarning?: boolean;
  lowStockThreshold?: string | null;
  description?: string | null;
}

export async function updateItemTx(
  tx: Tx,
  itemId: string,
  patch: ItemPatch,
): Promise<Item> {
  const [row] = await tx
    .update(items)
    .set(patch)
    .where(eq(items.id, itemId))
    .returning();
  if (!row) throw new Error("Update item returned no row");
  return row;
}

export async function softDeleteItemTx(
  tx: Tx,
  itemId: string,
): Promise<void> {
  await tx
    .update(items)
    .set({ deletedAt: new Date() })
    .where(eq(items.id, itemId));
}

/**
 * Active product items at or below their low-stock threshold. Stock-on-hand is
 * `SUM(qty)` over the item's movement rows (the only ledger of truth) — done
 * inline with a correlated subquery so a 200-item catalog still resolves in
 * one round-trip. Services that don't track stock (no movements at all) sum
 * to 0 and surface only when their threshold is > 0.
 *
 * Returns the items with their resolved current stock attached.
 */
export async function listLowStockItems(
  businessId: string,
): Promise<Array<Item & { currentStock: string }>> {
  const stockExpr = sql<string>`(
    select coalesce(sum(${stockMovements.qty}), 0)::text
    from ${stockMovements}
    where ${stockMovements.itemId} = ${items.id}
  )`;

  const rows = await db
    .select({ item: items, stock: stockExpr.as("current_stock") })
    .from(items)
    .where(
      and(
        eq(items.businessId, businessId),
        eq(items.type, "product"),
        eq(items.isActive, true),
        isNull(items.deletedAt),
        eq(items.enableLowStockWarning, true),
        sql`${items.lowStockThreshold} is not null`,
        sql`(
          select coalesce(sum(${stockMovements.qty}), 0)
          from ${stockMovements}
          where ${stockMovements.itemId} = ${items.id}
        ) <= ${items.lowStockThreshold}`,
      ),
    )
    .orderBy(asc(stockExpr));
  return rows.map((r) => ({ ...r.item, currentStock: r.stock }));
}
