"use client";
/**
 * Add/Reduce Money modal — writes a `manual_adjustment` ledger entry to a
 * chosen money account. The account dropdown lets the user pick from any of
 * their accounts; defaults to the one provided (e.g. on the account detail
 * page) or the first one in the list.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MoneyAccount } from "@/lib/db/schema";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function AdjustBalanceModal({
  accounts,
  defaultAccountId,
  triggerLabel = "Add / Reduce",
  balances,
}: {
  accounts: MoneyAccount[];
  defaultAccountId?: string;
  triggerLabel?: string;
  /** Optional preview map: accountId → current balance string. */
  balances?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(
    defaultAccountId ?? accounts[0]?.id ?? "",
  );
  const [direction, setDirection] = useState<"add" | "reduce">("add");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }
    if (!amount.trim() || Number(amount) <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/money-accounts/${accountId}/adjust`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction,
            amount: amount.trim(),
            entryDate: entryDate || undefined,
            notes: notes.trim() || null,
          }),
        },
      );
      const json = (await res.json()) as
        | { ok: true; data: { balance: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(`Balance updated — now ₹ ${json.data.balance}`);
      setOpen(false);
      setAmount("");
      setNotes("");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
    );
  }

  const currentBalance = balances?.[accountId] ?? null;
  const preview =
    amount && currentBalance != null
      ? direction === "add"
        ? (Number(currentBalance) + Number(amount)).toFixed(2)
        : (Number(currentBalance) - Number(amount)).toFixed(2)
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold">Adjust balance</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-account">Account</Label>
            <select
              id="adj-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={SELECT_CLASS}
              disabled={accounts.length === 1}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            {(["add", "reduce"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-colors ${
                  direction === d
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:border-ring"
                }`}
              >
                {d === "add" ? "+ Add money" : "− Reduce money"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-amount">Amount (₹)</Label>
            <Input
              id="adj-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
            />
          </div>

          {(currentBalance != null || preview != null) && (
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
              {currentBalance != null && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Current balance</span>
                  <span className="tabular-nums text-foreground">
                    ₹ {currentBalance}
                  </span>
                </div>
              )}
              {preview != null && (
                <div className="mt-1 flex justify-between text-muted-foreground">
                  <span>After this change</span>
                  <span className="tabular-nums font-semibold text-foreground">
                    ₹ {preview}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="adj-date">Date</Label>
              <Input
                id="adj-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="adj-notes">Notes</Label>
              <Input
                id="adj-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why?"
              />
            </div>
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
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
