"use client";
/**
 * Adjust Stock modal.
 *
 * Writes a single `manual_adjustment` movement under the FOR UPDATE lock in
 * the service layer. The form posts `direction` (add/reduce) + a positive
 * `qty`; the service signs the qty.
 *
 * On success the page reloads so the Stock summary + Movements list re-fetch.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdjustStockModal({
  itemId,
  unitCode,
  currentStock,
}: {
  itemId: string;
  unitCode: string | null;
  currentStock: string;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"add" | "reduce">("add");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setDirection("add");
    setQty("");
    setNotes("");
  }

  async function submit() {
    if (!qty.trim() || Number(qty) <= 0) {
      toast.error("Enter a quantity greater than zero");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/items/${itemId}/adjust-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          qty: qty.trim(),
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { closingStock: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(`Stock updated — now ${json.data.closingStock}`);
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
        Adjust stock
      </Button>
    );
  }

  // Live preview: new stock = current ± qty.
  const previewClosing = qty
    ? direction === "add"
      ? (Number(currentStock) + Number(qty)).toString()
      : (Number(currentStock) - Number(qty)).toString()
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
        <h2 className="mb-4 text-base font-semibold">Adjust stock</h2>
        <div className="flex flex-col gap-4">
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
                {d === "add" ? "+ Add stock" : "− Reduce stock"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-qty">
              Quantity {unitCode && `(${unitCode})`}
            </Label>
            <Input
              id="adj-qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              autoFocus
            />
          </div>
          <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Current stock</span>
              <span className="tabular-nums text-foreground">
                {currentStock}
              </span>
            </div>
            {previewClosing !== null && (
              <div className="mt-1 flex justify-between text-muted-foreground">
                <span>After this change</span>
                <span className="tabular-nums font-semibold text-foreground">
                  {previewClosing}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-notes">Notes (optional)</Label>
            <Input
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is the stock changing?"
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
            disabled={busy || !qty.trim()}
          >
            {busy ? "Saving…" : "Save adjustment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
