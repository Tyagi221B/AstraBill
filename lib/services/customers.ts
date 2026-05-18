/**
 * Customer service — RBAC + audit, thin over the customer repository.
 *
 * Soft delete (deleted_at) rather than hard delete: invoices keep their
 * snapshot of the customer (the `customer_id` FK uses `set null` on delete,
 * but soft delete leaves the row in place — historical invoices remain
 * navigable for audit, just no longer surfaced in customer lists).
 */
import "server-only";

import { db } from "../db";
import type { Customer } from "../db/schema";
import { NotFoundError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "../schemas/customer";
import {
  getCustomerForUser,
  getCustomerForUserTx,
  insertCustomer,
  listCustomersForUser,
  softDeleteCustomer,
  updateCustomer as updateCustomerRow,
} from "../repositories/customers";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createCustomer(
  input: CreateCustomerInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Customer> {
  await requirePermission(actorUserId, input.businessId, "customer:create");

  return db.transaction(async (tx) => {
    const row = await insertCustomer(tx, {
      businessId: input.businessId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      gstin: input.gstin ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      stateCode: input.stateCode ?? null,
      pincode: input.pincode ?? null,
      notes: input.notes ?? null,
    });

    await writeAuditEntry(tx, {
      action: "customer.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "customer",
      entityId: row.id,
      changes: { name: row.name, hasGstin: row.gstin !== null },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return row;
  });
}

export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Customer> {
  return db.transaction(async (tx) => {
    // Authorise via membership lookup first, so we know what business the
    // RBAC check should target.
    const existing = await getCustomerForUserTx(tx, actorUserId, customerId);
    if (!existing) throw new NotFoundError("Customer not found");
    await requirePermission(actorUserId, existing.businessId, "customer:edit");

    // Patch is the input as-is; Zod has already trimmed and validated.
    const updated = await updateCustomerRow(tx, customerId, input);

    await writeAuditEntry(tx, {
      action: "customer.update",
      businessId: existing.businessId,
      actorUserId,
      entityType: "customer",
      entityId: customerId,
      changes: input,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}

export async function deleteCustomer(
  customerId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getCustomerForUserTx(tx, actorUserId, customerId);
    if (!existing) throw new NotFoundError("Customer not found");
    await requirePermission(actorUserId, existing.businessId, "customer:delete");

    await softDeleteCustomer(tx, customerId);

    await writeAuditEntry(tx, {
      action: "customer.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "customer",
      entityId: customerId,
      changes: { name: existing.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export async function getCustomer(
  customerId: string,
  actorUserId: string,
): Promise<Customer | null> {
  return getCustomerForUser(actorUserId, customerId);
}

export { listCustomersForUser };
