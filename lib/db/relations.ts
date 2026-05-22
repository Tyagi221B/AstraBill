/**
 * Drizzle relations — powers the `db.query.X.findMany({ with: { ... } })` API.
 *
 * Defined separately from schema.ts so schema.ts stays focused on table shape
 * (the canonical source of truth for columns and types) and relations stay
 * focused on graph navigation.
 *
 * IMPORTANT — reads on `numeric`-bearing children: prefer flat `db.select()`
 * plus a manual join over the relational `with:` API. Drizzle's relational
 * reads JSON-aggregate nested rows, which coerces `numeric` columns to JS
 * `number` — the money discipline forbids that. See database-and-rbac.md.
 */
import { relations } from "drizzle-orm";

import {
  accounts,
  auditLog,
  businessMembers,
  businesses,
  documentAdditionalCharges,
  documentLineItems,
  documents,
  parties,
  partyAddresses,
  paymentEntries,
  paymentEntryAllocations,
  stockMovements,
  users,
  whatsappMessages,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  memberships: many(businessMembers),
  documentsCreated: many(documents, { relationName: "documentCreatedBy" }),
  paymentsRecorded: many(paymentEntries, {
    relationName: "paymentEntryCreatedBy",
  }),
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
  parties: many(parties),
  documents: many(documents),
  paymentEntries: many(paymentEntries),
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

export const partiesRelations = relations(parties, ({ one, many }) => ({
  business: one(businesses, {
    fields: [parties.businessId],
    references: [businesses.id],
  }),
  addresses: many(partyAddresses),
  documents: many(documents),
  paymentEntries: many(paymentEntries),
}));

export const partyAddressesRelations = relations(partyAddresses, ({ one }) => ({
  party: one(parties, {
    fields: [partyAddresses.partyId],
    references: [parties.id],
  }),
  business: one(businesses, {
    fields: [partyAddresses.businessId],
    references: [businesses.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  business: one(businesses, {
    fields: [documents.businessId],
    references: [businesses.id],
  }),
  party: one(parties, {
    fields: [documents.partyId],
    references: [parties.id],
  }),
  // Source doc → the doc this one was converted/derived from
  // (quotation → invoice; invoice → credit note; etc).
  sourceDoc: one(documents, {
    fields: [documents.sourceDocId],
    references: [documents.id],
    relationName: "documentLineage",
  }),
  derivedDocs: many(documents, { relationName: "documentLineage" }),
  createdByUser: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
    relationName: "documentCreatedBy",
  }),
  lineItems: many(documentLineItems),
  additionalCharges: many(documentAdditionalCharges),
  allocations: many(paymentEntryAllocations),
  whatsappMessages: many(whatsappMessages),
}));

export const documentLineItemsRelations = relations(
  documentLineItems,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentLineItems.documentId],
      references: [documents.id],
    }),
    business: one(businesses, {
      fields: [documentLineItems.businessId],
      references: [businesses.id],
    }),
  }),
);

export const documentAdditionalChargesRelations = relations(
  documentAdditionalCharges,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentAdditionalCharges.documentId],
      references: [documents.id],
    }),
    business: one(businesses, {
      fields: [documentAdditionalCharges.businessId],
      references: [businesses.id],
    }),
  }),
);

export const paymentEntriesRelations = relations(
  paymentEntries,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [paymentEntries.businessId],
      references: [businesses.id],
    }),
    party: one(parties, {
      fields: [paymentEntries.partyId],
      references: [parties.id],
    }),
    allocations: many(paymentEntryAllocations),
    createdByUser: one(users, {
      fields: [paymentEntries.createdBy],
      references: [users.id],
      relationName: "paymentEntryCreatedBy",
    }),
  }),
);

export const paymentEntryAllocationsRelations = relations(
  paymentEntryAllocations,
  ({ one }) => ({
    paymentEntry: one(paymentEntries, {
      fields: [paymentEntryAllocations.paymentEntryId],
      references: [paymentEntries.id],
    }),
    document: one(documents, {
      fields: [paymentEntryAllocations.documentId],
      references: [documents.id],
    }),
    business: one(businesses, {
      fields: [paymentEntryAllocations.businessId],
      references: [businesses.id],
    }),
  }),
);

export const whatsappMessagesRelations = relations(
  whatsappMessages,
  ({ one }) => ({
    business: one(businesses, {
      fields: [whatsappMessages.businessId],
      references: [businesses.id],
    }),
    document: one(documents, {
      fields: [whatsappMessages.documentId],
      references: [documents.id],
    }),
  }),
);

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  business: one(businesses, {
    fields: [stockMovements.businessId],
    references: [businesses.id],
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
