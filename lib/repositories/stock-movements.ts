/**
 * stock_movements repository — append-only per-item stock ledger.
 *
 * Concurrency model (critical for stock correctness):
 *
 * Every write goes through `insertStockMovementWithLockTx`, which:
 *   1. Takes a row lock on `items` with `SELECT … FOR UPDATE`.
 *   2. Sums the existing movements for that item under the lock.
 *   3. Inserts the new row with `closing_stock_after = previous + qty`.
 *   4. Tx commit releases the lock.
 *
 * Two concurrent stock writes against the same item serialise — they can't
 * race to insert with stale closing_stock_after snapshots. Different items
 * remain fully parallel (lock is per row).
 *
 * Current stock for a given item is always `SUM(qty)` over its movements.
 * The cached `closing_stock_after` on the latest row is the same value
 * but a cheaper single-row read.
 */
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type StockMovement,
  type NewStockMovement,
  items,
  stockMovements,
} from "../db/schema";

interface InsertOpts {
  businessId: string;
  itemId: string;
  txnType: NewStockMovement["txnType"];
  /** Signed quantity: + inflow, − outflow. The service layer decides the sign. */
  qty: string;
  txnDate?: string; // YYYY-MM-DD; defaults to current_date if omitted
  relatedDocId?: string | null;
  relatedPartyId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

/**
 * Insert a movement under a `SELECT … FOR UPDATE` lock on `items`. Returns
 * the new movement plus the resulting closing stock. Must be called inside
 * an enclosing transaction.
 */
export async function insertStockMovementWithLockTx(
  tx: Tx,
  opts: InsertOpts,
): Promise<{ movement: StockMovement; closingStock: string }> {
  // 1) Lock the item row so concurrent stock writes serialise.
  const [locked] = await tx
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, opts.itemId), eq(items.businessId, opts.businessId)))
    .for("update");
  if (!locked) {
    throw new Error(
      `insertStockMovementWithLockTx: item ${opts.itemId} not found in business ${opts.businessId}`,
    );
  }

  // 2) Insert with closing_stock_after computed inline from `SUM(qty) + new`,
  //    so all arithmetic stays on the DB side (one source of truth). The
  //    inner aggregate runs under the lock acquired above, so concurrent
  //    writes on the same item can't double-count.
  //
  //    Type-discipline note: do NOT wrap this in `::text`. The codebase
  //    convention is `::text` casts only at READ time (SELECT projections),
  //    so postgres-js surfaces numerics as strings at the TS boundary.
  //    Casting on the WRITE side breaks the insert because the column is
  //    numeric(12,3). The `sql<string>` generic below is a TS type hint
  //    only — it does not emit a SQL cast.
  const newClosing = sql<string>`(
    (select coalesce(sum(${stockMovements.qty}), 0)
     from ${stockMovements}
     where ${stockMovements.itemId} = ${opts.itemId})
    + ${opts.qty}::numeric
  )`;

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      businessId: opts.businessId,
      itemId: opts.itemId,
      txnType: opts.txnType,
      qty: opts.qty,
      txnDate: opts.txnDate,
      closingStockAfter: newClosing,
      relatedDocId: opts.relatedDocId ?? null,
      relatedPartyId: opts.relatedPartyId ?? null,
      notes: opts.notes ?? null,
      createdBy: opts.createdBy ?? null,
    })
    .returning();
  if (!movement) {
    throw new Error("Insert item_stock_movement returned no row");
  }
  return {
    movement,
    closingStock: movement.closingStockAfter ?? "0",
  };
}

/**
 * Cheap current-stock read. Returns the `closing_stock_after` of the most
 * recent movement (the cached running balance), or "0" when the item has
 * no movements yet. For consistency with a subsequent write, prefer
 * `insertStockMovementWithLockTx` which re-sums under its own lock.
 */
export async function getCurrentStockForItem(
  itemId: string,
): Promise<string> {
  const [row] = await db
    .select({ closing: stockMovements.closingStockAfter })
    .from(stockMovements)
    .where(eq(stockMovements.itemId, itemId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(1);
  return row?.closing ?? "0";
}

/**
 * Batch — returns a Map<itemId, closingStock>. Used by the items list page
 * to render the Stock column in one round-trip. Items without any movement
 * are absent from the Map; callers default to "0".
 */
export async function getCurrentStockForItems(
  itemIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (itemIds.length === 0) return map;
  const rows = await db
    .select({
      itemId: stockMovements.itemId,
      total: sql<string>`coalesce(sum(${stockMovements.qty}), 0)::text`,
    })
    .from(stockMovements)
    .where(inArray(stockMovements.itemId, itemIds))
    .groupBy(stockMovements.itemId);
  for (const row of rows) {
    map.set(row.itemId, row.total);
  }
  return map;
}

/** Last N movements for one item — drives the Stock Details tab on detail. */
export async function listMovementsForItem(
  itemId: string,
  limit = 50,
): Promise<StockMovement[]> {
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemId, itemId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}
