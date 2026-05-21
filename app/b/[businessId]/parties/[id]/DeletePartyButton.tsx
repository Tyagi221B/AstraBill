"use client";
/**
 * Soft-delete a party. The "Cash Sale" walk-in is server-side blocked; this
 * button stays off for it via the disabled prop.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

export function DeletePartyButton({
  partyId,
  businessId,
  disabled,
}: {
  partyId: string;
  businessId: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm("Soft-delete this party? Documents keep the reference.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/parties/${partyId}`, { method: "DELETE" });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      window.location.assign(routes.b(businessId).parties);
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
      title={disabled ? "Cash Sale is structural and can't be deleted" : "Delete"}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
