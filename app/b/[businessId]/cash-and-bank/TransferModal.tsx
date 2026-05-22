"use client";
/**
 * Transfer Money modal — moves funds A → B, writing a paired
 * transfer_out / transfer_in ledger pair under a shared transfer_pair_id.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MoneyAccount } from "@/lib/db/schema";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function TransferModal({
  accounts,
  defaultFromId,
  balances,
}: {
  accounts: MoneyAccount[];
  defaultFromId?: string;
  balances?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(defaultFromId ?? accounts[0]?.id ?? "");
  const [toId, setToId] = useState(
    accounts.find((a) => a.id !== (defaultFromId ?? accounts[0]?.id))?.id ?? "",
  );
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fromId || !toId) {
      toast.error("Pick source and destination");
      return;
    }
    if (fromId === toId) {
      toast.error("Source and destination must be different");
      return;
    }
    if (!amount.trim() || Number(amount) <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/money-accounts/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccountId: fromId,
          toAccountId: toId,
          amount: amount.trim(),
          entryDate: entryDate || undefined,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { balances: { from: string; to: string } } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success("Transferred successfully");
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

  if (accounts.length < 2) return null;

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Transfer
      </Button>
    );
  }

  const sourceBal = balances?.[fromId];

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
        <h2 className="mb-4 text-base font-semibold">Transfer balance</h2>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-from">From</Label>
              <select
                id="tx-from"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className={SELECT_CLASS}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
              {sourceBal != null && (
                <p className="text-xs text-muted-foreground">
                  Available: ₹ {sourceBal}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-to">To</Label>
              <select
                id="tx-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className={SELECT_CLASS}
              >
                {accounts
                  .filter((a) => a.id !== fromId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-amount">Amount (₹)</Label>
            <Input
              id="tx-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-notes">Notes</Label>
              <Input
                id="tx-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
            {busy ? "Transferring…" : "Transfer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
