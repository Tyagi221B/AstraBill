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
      customer: (customerId: string) => `${base}/customers/${customerId}`,
      products: `${base}/products`,
      newProduct: `${base}/products/new`,
      product: (productId: string) => `${base}/products/${productId}`,
      settings: {
        branding: `${base}/settings/branding`,
      },
    };
  },
} as const;
