/**
 * Mock GSTIN adapter for local dev when no vendor API key is configured.
 *
 * Returns plausible synthetic profiles for any well-formed GSTIN. Never
 * throws GstinNotFoundError — every GSTIN "exists" in the mock. Embeds
 * the state code (chars 1–2) into the address block so the party form
 * still gets a usable auto-fill during dev.
 *
 * The factory picks this adapter when SANDBOX_API_KEY is absent. Persisted
 * cache rows tag `vendor='mock'` so a later prod fetch knows to refresh
 * the row (see service.ts → shouldRefreshMockRow).
 */
import "server-only";

import {
  type GstinLookupAdapter,
  type GstinProfile,
} from "./types";

export class MockGstinAdapter implements GstinLookupAdapter {
  readonly name = "mock";

  async fetch(gstin: string): Promise<GstinProfile> {
    // First two chars of a GSTIN are the state code — surface that so the
    // mock-fill in the party form still shows correct intra/inter-state GST.
    const stateCode = gstin.slice(0, 2);
    const pan = gstin.slice(2, 12);
    return {
      gstin,
      legalName: `Mock Enterprises (${pan})`,
      tradeName: `Mock Trading Co.`,
      address: {
        streetAddress: `Plot ${pan.slice(-3)}, MIDC Industrial Area`,
        city: "Pune",
        state: null,
        stateCode,
        pincode: "411019",
      },
      status: "Active",
      registrationDate: "2018-07-01",
      businessType: "Regular",
    };
  }
}
