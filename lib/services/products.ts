/**
 * Product service — RBAC, audit, and the purchase-price redaction policy.
 *
 * The critical invariant from RBAC: roles without `report:view_profit` must
 * NEVER see `purchasePrice` on a product. Service applies `redactForRole` at
 * every read edge — list reads consult a per-business role map so a user who
 * is owner in business A and salesman in business B sees purchasePrice for A
 * only.
 */
import "server-only";

import { db } from "../db";
import type { Product, Role } from "../db/schema";
import { NotFoundError } from "../errors";
import { redactForRole, requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "../schemas/product";
import {
  getProductForUser,
  getProductForUserTx,
  insertProduct,
  listProductsForUser as listProductRows,
  listUserRolesByBusiness,
  softDeleteProduct,
  updateProduct as updateProductRow,
} from "../repositories/products";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Product as it appears to API clients — `purchasePrice` may be absent
 *  for roles without `report:view_profit`. */
export type ProductView = Omit<Product, "purchasePrice"> & {
  purchasePrice?: string | null;
};

function viewFor(row: Product, role: Role): ProductView {
  return redactForRole(row, role) as ProductView;
}

export async function createProduct(
  input: CreateProductInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<ProductView> {
  const role = await requirePermission(
    actorUserId,
    input.businessId,
    "product:create",
  );

  return db.transaction(async (tx) => {
    const row = await insertProduct(tx, {
      businessId: input.businessId,
      name: input.name,
      hsnCode: input.hsnCode ?? null,
      unit: input.unit,
      gstRate: input.gstRate,
      purchasePrice: input.purchasePrice ?? null,
      sellingPrice: input.sellingPrice,
      stock: input.stock,
      lowStockThreshold: input.lowStockThreshold ?? null,
      isActive: input.isActive,
    });

    await writeAuditEntry(tx, {
      action: "product.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "product",
      entityId: row.id,
      changes: {
        name: row.name,
        sellingPrice: row.sellingPrice,
        gstRate: row.gstRate,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return viewFor(row, role);
  });
}

export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<ProductView> {
  return db.transaction(async (tx) => {
    const existing = await getProductForUserTx(tx, actorUserId, productId);
    if (!existing) throw new NotFoundError("Product not found");

    const role = await requirePermission(
      actorUserId,
      existing.businessId,
      "product:edit",
    );

    const updated = await updateProductRow(tx, productId, input);

    await writeAuditEntry(tx, {
      action: "product.update",
      businessId: existing.businessId,
      actorUserId,
      entityType: "product",
      entityId: productId,
      changes: input,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return viewFor(updated, role);
  });
}

export async function deleteProduct(
  productId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getProductForUserTx(tx, actorUserId, productId);
    if (!existing) throw new NotFoundError("Product not found");
    await requirePermission(actorUserId, existing.businessId, "product:delete");

    await softDeleteProduct(tx, productId);

    await writeAuditEntry(tx, {
      action: "product.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "product",
      entityId: productId,
      changes: { name: existing.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export async function getProduct(
  productId: string,
  actorUserId: string,
): Promise<ProductView | null> {
  const product = await getProductForUser(actorUserId, productId);
  if (!product) return null;
  const role = await requirePermission(
    actorUserId,
    product.businessId,
    "product:view",
  );
  return viewFor(product, role);
}

/**
 * List products visible to the caller. Per-row redaction: a user who's owner
 * in business A and salesman in business B sees purchasePrice for A's rows
 * but not B's.
 */
export async function listProductsForUser(opts: {
  userId: string;
  businessId?: string;
  limit?: number;
}): Promise<ProductView[]> {
  const [rows, roleByBiz] = await Promise.all([
    listProductRows(opts),
    listUserRolesByBusiness(opts.userId),
  ]);
  return rows.map((r) =>
    viewFor(r, (roleByBiz.get(r.businessId) as Role | undefined) ?? "viewer"),
  );
}
