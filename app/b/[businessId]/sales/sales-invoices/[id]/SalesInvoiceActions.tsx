"use client";
/**
 * Inline actions for the sales invoice detail header.
 *
 * Three transitions are wired here:
 *   - Draft → Finalised (assigns number + posts ledger + writes stock)
 *   - Finalised (any) → Cancelled (writes reversal entries)
 *   - Draft → hard-delete
 *
 * Each action is a small client component so the page server-renders the
 * read state and the buttons are the only interactive surface.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

export function FinaliseButton({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!window.confirm("Finalise this invoice? This assigns the document number and posts the ledger.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/finalise`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { ok: true; data: { docNumber: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(`Finalised as ${json.data.docNumber}`);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="primary" size="sm" onClick={go} disabled={busy}>
      {busy ? "Finalising…" : "Finalise"}
    </Button>
  );
}

export function CancelInvoiceButton({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    const reason = window.prompt(
      "Cancel this invoice? Reversal ledger entries will be written. Reason (optional):",
    );
    if (reason === null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success("Invoice cancelled");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={go} disabled={busy}>
      {busy ? "Cancelling…" : "Cancel"}
    </Button>
  );
}

export function DeleteDraftButton({
  documentId,
  businessId,
}: {
  documentId: string;
  businessId: string;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!window.confirm("Delete this draft? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      window.location.assign(routes.b(businessId).salesInvoices);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={go} disabled={busy}>
      Delete draft
    </Button>
  );
}
