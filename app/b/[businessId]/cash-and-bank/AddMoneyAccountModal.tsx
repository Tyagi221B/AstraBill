"use client";
/**
 * Add Money Account modal. Defaults to "cash"; toggling the Bank details
 * switch reveals the bank fields and requires account number + IFSC.
 *
 * On success reloads the page so the list + KPIs re-fetch with the new row.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountType = "cash" | "bank";

export function AddMoneyAccountModal({
  businessId,
}: {
  businessId: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AccountType>("cash");
  const [name, setName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [withBank, setWithBank] = useState(false);
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setType("cash");
    setName("");
    setOpeningBalance("");
    setOpeningDate("");
    setWithBank(false);
    setBankAccountNumber("");
    setConfirmAccountNumber("");
    setIfsc("");
    setBankName("");
    setBranchName("");
    setHolderName("");
    setUpiId("");
    setIsDefault(false);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Account name is required");
      return;
    }
    const finalType: AccountType = withBank ? "bank" : "cash";
    if (finalType === "bank") {
      if (!bankAccountNumber.trim() || !ifsc.trim()) {
        toast.error("Bank accounts need account number + IFSC");
        return;
      }
      if (bankAccountNumber.trim() !== confirmAccountNumber.trim()) {
        toast.error("Account numbers don't match");
        return;
      }
    }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        businessId,
        type: finalType,
        name: name.trim(),
        isDefault,
      };
      if (openingBalance.trim()) {
        payload.openingBalance = openingBalance.trim();
        if (openingDate) payload.openingBalanceAsOfDate = openingDate;
      }
      if (finalType === "bank") {
        payload.bankAccountNumber = bankAccountNumber.trim();
        payload.ifsc = ifsc.trim().toUpperCase();
        payload.bankName = bankName.trim() || null;
        payload.branchName = branchName.trim() || null;
        payload.accountHolderName = holderName.trim() || null;
        payload.upiId = upiId.trim() || null;
      }
      const res = await fetch("/api/money-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as
        | { ok: true; data: { id: string; name: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(`Added "${json.data.name}"`);
      setOpen(false);
      reset();
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
        + New account
      </Button>
    );
  }

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
        <h2 className="mb-4 text-base font-semibold">Add money account</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ma-name">Account name</Label>
            <Input
              id="ma-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ICICI Current A/c · Counter cash"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ma-opening">Opening balance</Label>
              <Input
                id="ma-opening"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ma-opening-date">As of date</Label>
              <Input
                id="ma-opening-date"
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withBank}
              onChange={(e) => {
                setWithBank(e.target.checked);
                setType(e.target.checked ? "bank" : "cash");
              }}
            />
            Add bank details (a real bank account)
          </label>

          {withBank && (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-input bg-muted/30 px-3 py-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ma-acct">Account number</Label>
                <Input
                  id="ma-acct"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ma-acct2">Re-enter account number</Label>
                <Input
                  id="ma-acct2"
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ma-ifsc">IFSC</Label>
                  <Input
                    id="ma-ifsc"
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                    className="font-mono uppercase"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ma-bank">Bank name</Label>
                  <Input
                    id="ma-bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ma-branch">Branch</Label>
                  <Input
                    id="ma-branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ma-holder">Account holder</Label>
                  <Input
                    id="ma-holder"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ma-upi">UPI ID (optional)</Label>
                <Input
                  id="ma-upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="merchant@upi"
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Set as default {withBank ? "bank account" : "cash drawer"}
          </label>
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
            disabled={busy || !name.trim()}
          >
            {busy ? "Adding…" : "Add account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
