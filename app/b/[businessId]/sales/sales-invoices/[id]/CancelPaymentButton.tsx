"use client";
/**
 * Cancel-a-recorded-payment button. The service writes reversal ledger
 * rows and re-derives the document's amount_received + status.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";

export function CancelPaymentButton({
  paymentEntryId,
}: {
  paymentEntryId: string;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    const reason = window.prompt(
      "Void this payment? Reversal ledger entries will be written. Reason (optional):",
    );
    if (reason === null) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/payment-entries/${paymentEntryId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success("Payment voided");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="text-xs text-red-700 hover:underline disabled:opacity-50 dark:text-red-400"
    >
      Void
    </button>
  );
}
