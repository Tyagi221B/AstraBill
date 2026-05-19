"use client";
/**
 * PaymentPanel — record + view payments on a finalised invoice.
 *
 * Shown only on finalised invoices (the server gates that). Records go to
 * POST /api/invoices/[id]/payments; voids to DELETE /api/payments/[id].
 * After either, the page reloads so the server re-derives the invoice
 * status + balance — the panel never computes authoritative money itself
 * (the displayed balance is cosmetic; the service owns the real sum).
 */
import { useState, type FormEvent } from "react";
import posthog from "posthog-js";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PaymentRow {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  paidAt: string; // YYYY-MM-DD
}

const METHODS = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHODS.map((m) => [m.value, m.label]),
);

const fmt = (n: string | number) =>
  `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

export function PaymentPanel({
  invoiceId,
  total,
  amountPaid,
  payments,
  canRecord,
  canDelete,
}: {
  invoiceId: string;
  total: string;
  amountPaid: string;
  payments: PaymentRow[];
  canRecord: boolean;
  canDelete: boolean;
}) {
  const paidNum = Number(amountPaid);
  const totalNum = Number(total);
  const balance = Math.max(0, totalNum - paidNum);
  const fullyPaid = paidNum >= totalNum;
  const pct =
    totalNum > 0 ? Math.min(100, Math.round((paidNum / totalNum) * 100)) : 0;

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    balance > 0 ? balance.toFixed(2) : "0.00",
  );
  const [method, setMethod] = useState<string>("upi");
  const [paidAt, setPaidAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function record(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method,
          paidAt: paidAt || undefined,
          reference: reference.trim() || null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      posthog.capture("payment_recorded", { invoice_id: invoiceId });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (
      !confirm("Void this payment? The invoice balance will be recalculated.")
    ) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Payments</h2>
          {canRecord && !open && (
            <Button
              type="button"
              variant={fullyPaid ? "outline" : "primary"}
              size="sm"
              onClick={() => setOpen(true)}
            >
              + Record payment
            </Button>
          )}
        </div>

        {/* ---- summary ---- */}
        <div className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              Paid{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {fmt(amountPaid)}
              </span>{" "}
              of <span className="tabular-nums">{fmt(total)}</span>
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                fullyPaid ? "text-success" : "text-foreground",
              )}
            >
              {fullyPaid ? "Fully paid" : `${fmt(balance)} due`}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                fullyPaid ? "bg-success" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* ---- record form ---- */}
        {open && (
          <form
            onSubmit={record}
            className="mb-5 rounded-md border border-border bg-muted/40 p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <Input
                  id="pay-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-method">Method</Label>
                <select
                  id="pay-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-date">Date received</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-ref">
                  Reference{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="pay-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UPI ref / cheque no."
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={busy || Number(amount) <= 0}
              >
                {busy ? "Recording…" : "Record payment"}
              </Button>
            </div>
          </form>
        )}

        {/* ---- history ---- */}
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments recorded yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Method</th>
                <th className="py-2 font-medium">Reference</th>
                <th className="py-2 text-right font-medium">Amount</th>
                {canDelete && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2.5 tabular-nums text-muted-foreground">
                    {p.paidAt}
                  </td>
                  <td className="py-2.5">{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {p.reference || "—"}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums">
                    {fmt(p.amount)}
                  </td>
                  {canDelete && (
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        disabled={deletingId !== null}
                        className="text-xs text-destructive transition-colors hover:underline disabled:opacity-50"
                      >
                        {deletingId === p.id ? "Voiding…" : "Void"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
