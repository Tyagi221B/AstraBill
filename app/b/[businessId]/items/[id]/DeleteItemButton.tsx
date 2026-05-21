"use client";
/**
 * Soft-delete an item. Historical documents keep their snapshot of the item
 * via the line-items' name/code/HSN snapshots, so deleting here doesn't
 * mutate any issued invoice.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

export function DeleteItemButton({
  itemId,
  businessId,
}: {
  itemId: string;
  businessId: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm("Soft-delete this item? Past documents keep their snapshot.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      window.location.assign(routes.b(businessId).items);
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
      disabled={busy}
      title="Delete"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
