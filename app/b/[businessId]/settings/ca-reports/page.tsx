import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "CA Reports Sharing" };

export default function CaReportsPage() {
  return (
    <ComingSoon
      title="CA Reports Sharing"
      description="Add your CA's email and we'll send GSTR-1, GSTR-3B, and books exports on a schedule. Until then, you can export each report manually from the Reports section."
    />
  );
}
