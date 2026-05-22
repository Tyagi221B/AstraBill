"use client";
/**
 * Shared document detail-page action buttons.
 *
 * Each is a small client component so the detail page server-renders the
 * read state and the buttons are the only interactive surface. The detail
 * page picks which to render based on doc status + type.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";

export function FinaliseButton({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (
      !window.confirm(
        "Finalise this document? This locks the number and posts ledger / stock entries.",
      )
    )
      return;
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

export function CancelDocumentButton({
  documentId,
}: {
  documentId: string;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    const reason = window.prompt(
      "Cancel this document? Reversal entries will be written. Reason (optional):",
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
      toast.success("Cancelled");
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
  redirectTo,
}: {
  documentId: string;
  redirectTo: string;
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
      window.location.assign(redirectTo);
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

/**
 * Convert a finalised quotation into a draft sales invoice. POSTs to
 * /api/documents/[id]/convert and redirects to the new draft's edit page.
 */
export function ConvertToInvoiceButton({
  quotationId,
  detailRouteFor,
}: {
  quotationId: string;
  detailRouteFor: (newInvoiceId: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (
      !window.confirm(
        "Create a sales invoice from this quotation? You'll be able to review and finalise the draft.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${quotationId}/convert`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { ok: true; data: { id: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success("Invoice draft created from quotation");
      window.location.assign(detailRouteFor(json.data.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="primary" size="sm" onClick={go} disabled={busy}>
      {busy ? "Converting…" : "Convert to invoice"}
    </Button>
  );
}
