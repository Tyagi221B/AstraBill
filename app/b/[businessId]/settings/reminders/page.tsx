import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "Reminders" };

export default function RemindersPage() {
  return (
    <ComingSoon
      title="Reminders"
      description="Auto-send WhatsApp payment reminders for overdue invoices on a schedule you define. Today, reminders are sent manually from each invoice's actions menu."
    />
  );
}
