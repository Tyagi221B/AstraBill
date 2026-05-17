/**
 * Drizzle relations — powers the `db.query.X.findMany({ with: { ... } })` API.
 *
 * Defined separately from schema.ts so schema.ts stays focused on table shape
 * (the canonical source of truth for columns and types) and relations stay
 * focused on graph navigation.
 */
import { relations } from "drizzle-orm";
import {
  accounts,
  auditLog,
  businessMembers,
  businesses,
  customers,
  invoiceLineItems,
  invoices,
  payments,
  products,
  stockMovements,
  users,
  whatsappMessages,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  memberships: many(businessMembers),
  invoicesCreated: many(invoices, { relationName: "invoiceCreatedBy" }),
  paymentsRecorded: many(payments, { relationName: "paymentCreatedBy" }),
  stockMovementsRecorded: many(stockMovements, {
    relationName: "stockMovementCreatedBy",
  }),
  auditEvents: many(auditLog, { relationName: "auditActor" }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const businessesRelations = relations(businesses, ({ many }) => ({
  members: many(businessMembers),
  customers: many(customers),
  products: many(products),
  invoices: many(invoices),
  payments: many(payments),
  whatsappMessages: many(whatsappMessages),
  stockMovements: many(stockMovements),
  auditEvents: many(auditLog),
}));

export const businessMembersRelations = relations(
  businessMembers,
  ({ one }) => ({
    business: one(businesses, {
      fields: [businessMembers.businessId],
      references: [businesses.id],
    }),
    user: one(users, {
      fields: [businessMembers.userId],
      references: [users.id],
    }),
  }),
);

export const customersRelations = relations(customers, ({ one, many }) => ({
  business: one(businesses, {
    fields: [customers.businessId],
    references: [businesses.id],
  }),
  invoices: many(invoices),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  business: one(businesses, {
    fields: [products.businessId],
    references: [businesses.id],
  }),
  lineItems: many(invoiceLineItems),
  stockMovements: many(stockMovements),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  business: one(businesses, {
    fields: [invoices.businessId],
    references: [businesses.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  // Credit/debit note → the invoice it adjusts.
  originalInvoice: one(invoices, {
    fields: [invoices.originalInvoiceId],
    references: [invoices.id],
    relationName: "invoiceAdjustments",
  }),
  adjustments: many(invoices, { relationName: "invoiceAdjustments" }),
  createdByUser: one(users, {
    fields: [invoices.createdBy],
    references: [users.id],
    relationName: "invoiceCreatedBy",
  }),
  lineItems: many(invoiceLineItems),
  payments: many(payments),
  whatsappMessages: many(whatsappMessages),
  stockMovements: many(stockMovements),
}));

export const invoiceLineItemsRelations = relations(
  invoiceLineItems,
  ({ one }) => ({
    invoice: one(invoices, {
      fields: [invoiceLineItems.invoiceId],
      references: [invoices.id],
    }),
    product: one(products, {
      fields: [invoiceLineItems.productId],
      references: [products.id],
    }),
    business: one(businesses, {
      fields: [invoiceLineItems.businessId],
      references: [businesses.id],
    }),
  }),
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  business: one(businesses, {
    fields: [payments.businessId],
    references: [businesses.id],
  }),
  createdByUser: one(users, {
    fields: [payments.createdBy],
    references: [users.id],
    relationName: "paymentCreatedBy",
  }),
}));

export const whatsappMessagesRelations = relations(
  whatsappMessages,
  ({ one }) => ({
    business: one(businesses, {
      fields: [whatsappMessages.businessId],
      references: [businesses.id],
    }),
    invoice: one(invoices, {
      fields: [whatsappMessages.invoiceId],
      references: [invoices.id],
    }),
  }),
);

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  business: one(businesses, {
    fields: [stockMovements.businessId],
    references: [businesses.id],
  }),
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  invoice: one(invoices, {
    fields: [stockMovements.invoiceId],
    references: [invoices.id],
  }),
  createdByUser: one(users, {
    fields: [stockMovements.createdBy],
    references: [users.id],
    relationName: "stockMovementCreatedBy",
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  business: one(businesses, {
    fields: [auditLog.businessId],
    references: [businesses.id],
  }),
  actor: one(users, {
    fields: [auditLog.actorUserId],
    references: [users.id],
    relationName: "auditActor",
  }),
}));
