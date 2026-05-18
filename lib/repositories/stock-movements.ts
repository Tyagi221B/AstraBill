/**
 * Stock-movements repository — append-only ledger of `in`/`out` movements.
 * Corrections are new movements, never edits or deletes (that's why this
 * table has no `deleted_at`).
 */
import "server-only";

import type { Tx } from "../db";
import {
  type NewStockMovement,
  type StockMovement,
  stockMovements,
} from "../db/schema";

export async function insertStockMovement(
  tx: Tx,
  values: NewStockMovement,
): Promise<StockMovement> {
  const [row] = await tx.insert(stockMovements).values(values).returning();
  if (!row) throw new Error("Insert stock_movement returned no row");
  return row;
}
