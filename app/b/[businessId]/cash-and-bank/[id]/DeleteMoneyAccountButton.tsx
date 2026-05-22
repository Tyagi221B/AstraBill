"use client";
/**
 * Soft-delete a money account. Refused at the server if balance ≠ 0 —
 * book invariant: no orphaned cash on the ledger after the row hides.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

export function DeleteMoneyAccountButton({
  accountId,
  businessId,
  disabled,
}: {
  accountId: string;
  businessId: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (
      !window.confirm(
        "Delete this account? You can only delete an account with a zero balance.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/money-accounts/${accountId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      window.location.assign(routes.b(businessId).cashAndBank);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onDelete}
      disabled={busy || disabled}
      title={disabled ? "Balance must be zero to delete" : "Delete"}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
