"use client";
/**
 * Inline panel for managing a party's bank accounts.
 *
 * - List of existing banks with default badge + edit + delete
 * - "Add bank" reveals an inline form with IFSC auto-lookup (Razorpay
 *   public endpoint via /api/ifsc/[code])
 * - Each action hits the bank-accounts CRUD directly (independent of the
 *   main party form's submit button)
 *
 * UX rules:
 *   - First bank a party gets is auto-default; the user can flip it
 *   - Setting one as default unflags the others (server enforces)
 *   - IFSC change triggers auto-fill of bank name + branch when blank;
 *     prompts to overwrite if already filled
 */
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PartyBankAccount } from "@/lib/db/schema";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

interface BankFormState {
  bankAccountNumber: string;
  ifsc: string;
  accountHolderName: string;
  bankName: string;
  branchName: string;
  upiId: string;
  isDefault: boolean;
}

const blankBank: BankFormState = {
  bankAccountNumber: "",
  ifsc: "",
  accountHolderName: "",
  bankName: "",
  branchName: "",
  upiId: "",
  isDefault: false,
};

function bankToForm(b: PartyBankAccount): BankFormState {
  return {
    bankAccountNumber: b.bankAccountNumber,
    ifsc: b.ifsc ?? "",
    accountHolderName: b.accountHolderName ?? "",
    bankName: b.bankName ?? "",
    branchName: b.branchName ?? "",
    upiId: b.upiId ?? "",
    isDefault: b.isDefault,
  };
}

interface IfscLookupData {
  ifsc: string;
  bankName: string | null;
  branchName: string | null;
}

export function PartyBankAccountsPanel({
  partyId,
  initial,
}: {
  partyId: string;
  initial: PartyBankAccount[];
}) {
  const [banks, setBanks] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BankFormState>(blankBank);
  const [busy, setBusy] = useState(false);
  const [ifscBusy, setIfscBusy] = useState(false);

  function startAdd() {
    setEditingId(null);
    setForm({ ...blankBank, isDefault: banks.length === 0 });
    setAdding(true);
  }

  function startEdit(b: PartyBankAccount) {
    setAdding(false);
    setEditingId(b.id);
    setForm(bankToForm(b));
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setForm(blankBank);
  }

  async function lookupIfsc() {
    const code = form.ifsc.trim().toUpperCase();
    if (!IFSC_RE.test(code)) {
      toast.error("Enter a valid IFSC first");
      return;
    }
    setIfscBusy(true);
    try {
      const res = await fetch(`/api/ifsc/${encodeURIComponent(code)}`);
      const json = (await res.json()) as
        | { ok: true; data: IfscLookupData }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      const { bankName, branchName } = json.data;
      const shouldOverwriteBank =
        bankName !== null &&
        (!form.bankName.trim() ||
          window.confirm(`Replace bank name with "${bankName}"?`));
      const shouldOverwriteBranch =
        branchName !== null &&
        (!form.branchName.trim() ||
          window.confirm(`Replace branch name with "${branchName}"?`));
      setForm((f) => ({
        ...f,
        bankName: shouldOverwriteBank ? bankName! : f.bankName,
        branchName: shouldOverwriteBranch ? branchName! : f.branchName,
      }));
      toast.success("IFSC details fetched");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "IFSC lookup failed",
      );
    } finally {
      setIfscBusy(false);
    }
  }

  async function save() {
    if (!form.bankAccountNumber.trim()) {
      toast.error("Account number is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        bankAccountNumber: form.bankAccountNumber.trim(),
        ifsc: form.ifsc.trim().toUpperCase() || null,
        accountHolderName: form.accountHolderName.trim() || null,
        bankName: form.bankName.trim() || null,
        branchName: form.branchName.trim() || null,
        upiId: form.upiId.trim() || null,
        isDefault: form.isDefault,
      };

      if (editingId) {
        const res = await fetch(
          `/api/parties/${partyId}/bank-accounts/${editingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const json = (await res.json()) as
          | { ok: true; data: PartyBankAccount }
          | { ok: false; error: { message: string } };
        if (!json.ok) {
          toast.error(json.error.message);
          return;
        }
        // Refetch to pick up default-flag flips on siblings.
        await refetch();
      } else {
        const res = await fetch(`/api/parties/${partyId}/bank-accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as
          | { ok: true; data: PartyBankAccount }
          | { ok: false; error: { message: string } };
        if (!json.ok) {
          toast.error(json.error.message);
          return;
        }
        await refetch();
      }
      cancel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(bank: PartyBankAccount) {
    if (
      !window.confirm(
        `Delete bank account ending ${bank.bankAccountNumber.slice(-4)}?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/parties/${partyId}/bank-accounts/${bank.id}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setBanks((prev) => prev.filter((b) => b.id !== bank.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function setDefault(bank: PartyBankAccount) {
    try {
      const res = await fetch(
        `/api/parties/${partyId}/bank-accounts/${bank.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true }),
        },
      );
      const json = (await res.json()) as
        | { ok: true; data: PartyBankAccount }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function refetch() {
    const res = await fetch(`/api/parties/${partyId}/bank-accounts`);
    const json = (await res.json()) as
      | { ok: true; data: { banks: PartyBankAccount[] } }
      | { ok: false; error: { message: string } };
    if (json.ok) setBanks(json.data.banks);
  }

  const isEditing = adding || editingId !== null;

  return (
    <div className="flex flex-col gap-4">
      {banks.length === 0 && !isEditing ? (
        <p className="rounded-md border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
          No bank accounts on file.
        </p>
      ) : null}

      {banks.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-input">
          {banks.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {b.bankName ?? "Bank"}
                  </span>
                  {b.isDefault && <Badge tone="info">Default</Badge>}
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  •••• {b.bankAccountNumber.slice(-4)}
                  {b.ifsc ? ` · ${b.ifsc}` : ""}
                  {b.branchName ? ` · ${b.branchName}` : ""}
                </p>
                {b.upiId && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    UPI: <span className="font-mono">{b.upiId}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!b.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault(b)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Set as default"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(b)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(b)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isEditing ? (
        <div className="rounded-md border border-input p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {editingId ? "Edit bank account" : "Add bank account"}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="bank-acc-no">
                Account number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bank-acc-no"
                value={form.bankAccountNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))
                }
                placeholder="123456789012"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-end justify-between gap-2">
                <Label htmlFor="bank-ifsc">IFSC</Label>
                <button
                  type="button"
                  onClick={lookupIfsc}
                  disabled={!IFSC_RE.test(form.ifsc.trim().toUpperCase()) || ifscBusy}
                  className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  {ifscBusy ? "Looking up…" : "Look up"}
                </button>
              </div>
              <Input
                id="bank-ifsc"
                value={form.ifsc}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    ifsc: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="HDFC0001234"
                className="font-mono uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bank-holder">Account holder name</Label>
              <Input
                id="bank-holder"
                value={form.accountHolderName}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    accountHolderName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bank-name">Bank name</Label>
              <Input
                id="bank-name"
                value={form.bankName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bankName: e.target.value }))
                }
                placeholder="HDFC Bank"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bank-branch">Branch</Label>
              <Input
                id="bank-branch"
                value={form.branchName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, branchName: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="bank-upi">UPI ID</Label>
              <Input
                id="bank-upi"
                value={form.upiId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, upiId: e.target.value }))
                }
                placeholder="name@upi"
                className="font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isDefault: e.target.checked }))
                }
              />
              Set as default bank for this party
            </label>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancel}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={save}
              disabled={busy || !form.bankAccountNumber.trim()}
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Add bank"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startAdd}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add bank account
          </Button>
        </div>
      )}
    </div>
  );
}
