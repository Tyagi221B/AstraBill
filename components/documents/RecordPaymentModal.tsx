"use client";
/**
 * Generic Record Payment modal — handles both Payment In (sales side) and
 * Payment Out (purchase side). Posts the single doc as the allocation.
 *
 * Service writes the two-leg ledger + optional settlement-discount third
 * leg + refreshes amount_received + status in one transaction.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MoneyAccount } from "@/lib/db/schema";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type PaymentMode = "upi" | "cash" | "bank_transfer" | "card" | "cheque" | "other";

const MODE_LABELS: Record<PaymentMode, string> = {
  upi: "UPI",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export function RecordPaymentModal({
  documentId,
  businessId,
  partyId,
  outstanding,
  defaultDate,
  moneyAccounts,
  entryType,
  triggerLabel,
  modalTitle,
}: {
  documentId: string;
  businessId: string;
  partyId: string;
  outstanding: string;
  defaultDate: string;
  moneyAccounts: MoneyAccount[];
  /** "payment_in" for sales / credit-note; "payment_out" for purchase / debit-note. */
  entryType: "payment_in" | "payment_out";
  triggerLabel: string;
  modalTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(outstanding);
  const [discount, setDiscount] = useState("0");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [accountId, setAccountId] = useState(
    moneyAccounts.find((a) => a.isDefault && a.type === "cash")?.id ??
      moneyAccounts[0]?.id ??
      "",
  );
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!amount.trim() || Number(amount) <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (Number(amount) > Number(outstanding)) {
      toast.error("Amount exceeds outstanding balance");
      return;
    }
    if (!accountId) {
      toast.error("Pick a money account");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payment-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          entryType,
          entryDate,
          partyId,
          moneyAccountId: accountId,
          amount: amount.trim(),
          discountAmount: discount.trim() || "0",
          paymentMode: mode,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          allocations: [{ documentId, allocatedAmount: amount.trim() }],
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { id: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success("Payment recorded");
      setOpen(false);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
    );
  }

  const isOut = entryType === "payment_out";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold">{modalTitle}</h2>
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{isOut ? "Outstanding (we owe)" : "Outstanding"}</span>
              <span className="tabular-nums font-semibold text-foreground">
                ₹ {outstanding}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-amt">
                {isOut ? "Amount paid (₹)" : "Amount received (₹)"}
              </Label>
              <Input
                id="pay-amt"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-disc">Settlement discount (₹)</Label>
              <Input
                id="pay-disc"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-mode">Payment mode</Label>
              <select
                id="pay-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
                className={SELECT_CLASS}
              >
                {(Object.keys(MODE_LABELS) as PaymentMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pay-account">
              {isOut ? "Money leaves from" : "Money lands in"}
            </Label>
            <select
              id="pay-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={SELECT_CLASS}
            >
              {moneyAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pay-ref">Reference</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pay-notes">Notes</Label>
            <Input
              id="pay-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={busy || !amount.trim()}
          >
            {busy ? "Recording…" : "Record"}
          </Button>
        </div>
      </div>
    </div>
  );
}
