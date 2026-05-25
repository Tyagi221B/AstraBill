import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "Invoice Settings" };

export default function InvoiceSettingsPage() {
  return (
    <ComingSoon
      title="Invoice Settings"
      description="Change document number prefixes, starting sequences, default terms & conditions, and signature mode. Picks up where onboarding's seed left off."
    />
  );
}
