import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "Refer & Earn" };

export default function ReferEarnPage() {
  return (
    <ComingSoon
      title="Refer & Earn"
      description="Refer another shop to AstraBill — you both get a month of Pro free. We'll wire this up once paid plans go live."
    />
  );
}
