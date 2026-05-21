/**
 * items service — RBAC + audit, thin over the items repository.
 *
 * createItem also writes an `opening_stock` row into item_stock_movements
 * when openingStock > 0 — opening balance IS the first stock movement
 * (matches myBillBook's CSV ledger model), not just a column read. This
 * keeps SUM(item_stock_movements.qty) as the single source of truth for
 * on-hand stock from day one.
 *
 * Update / delete go through the standard RBAC + audit path. Soft delete
 * leaves history navigable for audit.
 */
import "server-only";
import Decimal from "decimal.js";

import { db } from "../db";
import type { Item } from "../db/schema";
import { NotFoundError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type { CreateItemInput, UpdateItemInput } from "../schemas/item";
import type { AdjustStockInput } from "../schemas/item-stock";
import {
  getItemForUser,
  getItemForUserTx,
  insertItemTx,
  listItemsForUser,
  softDeleteItemTx,
  updateItemTx,
} from "../repositories/items";
import { insertStockMovementWithLockTx } from "../repositories/item-stock-movements";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createItem(
  input: CreateItemInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Item> {
  await requirePermission(actorUserId, input.businessId, "item:create");

  return db.transaction(async (tx) => {
    const row = await insertItemTx(tx, {
      businessId: input.businessId,
      type: input.type,
      name: input.name,
      categoryId: input.categoryId ?? null,
      code: input.code ?? null,
      hsnSacCode: input.hsnSacCode ?? null,
      measuringUnitCode: input.measuringUnitCode ?? null,
      alternativeUnitCode: input.alternativeUnitCode ?? null,
      salesPrice: input.salesPrice ?? null,
      salesPriceIncludesTax: input.salesPriceIncludesTax ?? false,
      purchasePrice: input.purchasePrice ?? null,
      purchasePriceIncludesTax: input.purchasePriceIncludesTax ?? false,
      gstRate: input.gstRate ?? null,
      discountOnSalesPricePercent: input.discountOnSalesPricePercent ?? null,
      openingStock: input.openingStock ?? null,
      openingStockAsOfDate: input.openingStockAsOfDate ?? null,
      enableLowStockWarning: input.enableLowStockWarning ?? false,
      lowStockThreshold: input.lowStockThreshold ?? null,
      description: input.description ?? null,
    });

    // Opening stock IS the first movement (matches myBillBook's stock
    // ledger). Only write it if both type is product AND opening > 0.
    if (row.type === "product" && row.openingStock !== null) {
      const opening = new Decimal(row.openingStock);
      if (opening.gt(0)) {
        await insertStockMovementWithLockTx(tx, {
          businessId: row.businessId,
          itemId: row.id,
          txnType: "opening_stock",
          qty: opening.toFixed(3),
          txnDate: row.openingStockAsOfDate ?? undefined,
          createdBy: actorUserId,
          notes: "Opening stock",
        });
      }
    }

    await writeAuditEntry(tx, {
      action: "item.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "item",
      entityId: row.id,
      changes: {
        name: row.name,
        type: row.type,
        hasOpeningStock: row.openingStock !== null,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return row;
  });
}

export async function updateItem(
  itemId: string,
  input: UpdateItemInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Item> {
  return db.transaction(async (tx) => {
    const existing = await getItemForUserTx(tx, actorUserId, itemId);
    if (!existing) throw new NotFoundError("Item not found");
    await requirePermission(actorUserId, existing.businessId, "item:edit");

    // openingStock is the form-time input only — editing it does NOT
    // retroactively adjust on-hand stock. Adjust Stock is a separate action.
    const updated = await updateItemTx(tx, itemId, input);

    await writeAuditEntry(tx, {
      action: "item.update",
      businessId: existing.businessId,
      actorUserId,
      entityType: "item",
      entityId: itemId,
      changes: input,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}

export async function deleteItem(
  itemId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getItemForUserTx(tx, actorUserId, itemId);
    if (!existing) throw new NotFoundError("Item not found");
    await requirePermission(actorUserId, existing.businessId, "item:delete");

    await softDeleteItemTx(tx, itemId);

    await writeAuditEntry(tx, {
      action: "item.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "item",
      entityId: itemId,
      changes: { name: existing.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export async function getItem(
  itemId: string,
  actorUserId: string,
): Promise<Item | null> {
  return getItemForUser(actorUserId, itemId);
}

/**
 * Manual stock adjustment — writes a `manual_adjustment` movement under
 * the standard row-lock pattern. `direction` becomes the sign of `qty`;
 * the API enforces qty > 0 so the sign is unambiguous here.
 */
export async function adjustItemStock(
  itemId: string,
  input: AdjustStockInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<{ item: Item; closingStock: string }> {
  return db.transaction(async (tx) => {
    const item = await getItemForUserTx(tx, actorUserId, itemId);
    if (!item) throw new NotFoundError("Item not found");
    await requirePermission(actorUserId, item.businessId, "stock:adjust");

    const signed =
      input.direction === "add"
        ? new Decimal(input.qty).toFixed(3)
        : new Decimal(input.qty).negated().toFixed(3);

    const { closingStock } = await insertStockMovementWithLockTx(tx, {
      businessId: item.businessId,
      itemId: item.id,
      txnType: "manual_adjustment",
      qty: signed,
      txnDate: input.txnDate,
      notes: input.notes ?? null,
      createdBy: actorUserId,
    });

    await writeAuditEntry(tx, {
      action: "stock.adjust",
      businessId: item.businessId,
      actorUserId,
      entityType: "item",
      entityId: item.id,
      changes: {
        direction: input.direction,
        qty: input.qty,
        notes: input.notes ?? null,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { item, closingStock };
  });
}

export { listItemsForUser };
