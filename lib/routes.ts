/**
 * Typed path helpers — the SSOT for URL structure.
 *
 * Every internal link in the app goes through here. Pages don't template
 * strings (`/b/${id}/invoices` etc.) — they call `routes.b(id).invoices`.
 * When a route is renamed, only this file changes and TypeScript surfaces
 * every caller.
 *
 * Two shapes:
 *   - Constants at the root (auth-free, businessId-free): `routes.signIn`.
 *   - A `b(businessId)` factory that returns the family of business-scoped
 *     URLs for that id — ergonomic when building a sidebar that emits five
 *     links for the same business.
 */

export const routes = {
  home: "/",
  signIn: "/sign-in",
  onboarding: "/onboarding",
  /** Smart-redirect entry — resolves to /b/[mostRecentBusinessId]/dashboard. */
  dashboard: "/dashboard",
  /** Public, auth-free invoice view (Phase 2B). */
  publicInvoice: (token: string) => `/i/${token}`,

  /** All business-scoped pages live under `/b/[businessId]/...`. */
  b: (businessId: string) => {
    const base = `/b/${businessId}`;
    return {
      base,
      dashboard: `${base}/dashboard`,
      invoices: `${base}/invoices`,
      newInvoice: `${base}/invoices/new`,
      invoice: (invoiceId: string) => `${base}/invoices/${invoiceId}`,
      editInvoice: (invoiceId: string) =>
        `${base}/invoices/${invoiceId}/edit`,
      customers: `${base}/customers`,
      newCustomer: `${base}/customers/new`,
      /** Customer detail — contact, udhaar stats, invoice history. */
      customer: (customerId: string) => `${base}/customers/${customerId}`,
      editCustomer: (customerId: string) =>
        `${base}/customers/${customerId}/edit`,
      /** Parties — new domain (full-ledger pivot). Replaces customers in PR2. */
      parties: `${base}/parties`,
      newParty: `${base}/parties/new`,
      party: (partyId: string) => `${base}/parties/${partyId}`,
      editParty: (partyId: string) =>
        `${base}/parties/${partyId}/edit`,
      products: `${base}/products`,
      newProduct: `${base}/products/new`,
      // No product detail page yet — the only per-product page is edit.
      editProduct: (productId: string) =>
        `${base}/products/${productId}/edit`,
      /** Items — new domain (full-ledger pivot). Replaces products in PR2. */
      items: `${base}/items`,
      newItem: `${base}/items/new`,
      item: (itemId: string) => `${base}/items/${itemId}`,
      editItem: (itemId: string) => `${base}/items/${itemId}/edit`,
      /** Cash & Bank — money_accounts surface. */
      cashAndBank: `${base}/cash-and-bank`,
      moneyAccount: (id: string) => `${base}/cash-and-bank/${id}`,
      /** Sales documents (new domain — replaces invoices in PR2). */
      salesInvoices: `${base}/sales/sales-invoices`,
      newSalesInvoice: `${base}/sales/sales-invoices/new`,
      salesInvoice: (id: string) => `${base}/sales/sales-invoices/${id}`,
      editSalesInvoice: (id: string) =>
        `${base}/sales/sales-invoices/${id}/edit`,
      /** Quotations / estimates (sales side, non-financial). */
      quotations: `${base}/sales/quotations`,
      newQuotation: `${base}/sales/quotations/new`,
      quotation: (id: string) => `${base}/sales/quotations/${id}`,
      editQuotation: (id: string) =>
        `${base}/sales/quotations/${id}/edit`,
      /** Credit notes (sales returns). */
      creditNotes: `${base}/sales/credit-notes`,
      newCreditNote: `${base}/sales/credit-notes/new`,
      creditNote: (id: string) => `${base}/sales/credit-notes/${id}`,
      editCreditNote: (id: string) =>
        `${base}/sales/credit-notes/${id}/edit`,
      /** Purchase invoices (we owe a supplier). */
      purchaseInvoices: `${base}/purchases/purchase-invoices`,
      newPurchaseInvoice: `${base}/purchases/purchase-invoices/new`,
      purchaseInvoice: (id: string) =>
        `${base}/purchases/purchase-invoices/${id}`,
      editPurchaseInvoice: (id: string) =>
        `${base}/purchases/purchase-invoices/${id}/edit`,
      /** Debit notes (purchase returns). */
      debitNotes: `${base}/purchases/debit-notes`,
      newDebitNote: `${base}/purchases/debit-notes/new`,
      debitNote: (id: string) => `${base}/purchases/debit-notes/${id}`,
      editDebitNote: (id: string) =>
        `${base}/purchases/debit-notes/${id}/edit`,
      /** Reports landing + individual reports. */
      reports: `${base}/reports`,
      salesRegister: `${base}/reports/sales-register`,
      purchaseRegister: `${base}/reports/purchase-register`,
      partyStatement: `${base}/reports/party-statement`,
      receivablesAgeing: `${base}/reports/receivables-ageing`,
      payablesAgeing: `${base}/reports/payables-ageing`,
      hsnSummary: `${base}/reports/hsn-summary`,
      stockSummary: `${base}/reports/stock-summary`,
      gstr1: `${base}/reports/gstr-1`,
      gstr3b: `${base}/reports/gstr-3b`,
      settings: {
        branding: `${base}/settings/branding`,
        payments: `${base}/settings/payments`,
        itemCategories: `${base}/settings/item-categories`,
      },
    };
  },
} as const;
