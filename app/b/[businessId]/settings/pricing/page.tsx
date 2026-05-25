import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <ComingSoon
      title="Pricing"
      description="Upgrade to Pro for advanced features (e-invoicing, multi-user, auto-reconciliation, reminders). AstraBill is free during the launch period — the paid plan goes live before V1 GA."
    />
  );
}
