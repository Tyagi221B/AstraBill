"use client";
/**
 * Action buttons for an invoice detail page. For V1 these only appear on
 * DRAFT invoices — Edit, Mark as sent (finalise), Delete. Once an invoice is
 * finalised it's immutable, so there are no actions to show (until the
 * WhatsApp-send / payment features land).
 */
import Link from "next/link";
import { useState } from "react";
import posthog from "posthog-js";

import { Button, buttonClasses } from "@/components/ui/Button";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function InvoiceActions({
  businessId,
  invoiceId,
  status,
}: {
  businessId: string;
  invoiceId: string;
  status: string;
}) {
  const [busy, setBusy] = useState<null | "finalize" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const b = routes.b(businessId);

  // Only drafts have actions in V1.
  if (status !== "draft") return null;

  async function finalize() {
    if (
      !confirm(
        "Mark this invoice as sent? Once sent it can't be edited — " +
          "corrections then need a credit note.",
      )
    ) {
      return;
    }
    setBusy("finalize");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/finalize`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      posthog.capture("invoice_finalized", { invoice_id: invoiceId });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this draft invoice? This cannot be undone.")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      window.location.assign(b.invoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="mr-1 text-xs text-destructive">
          {error}
        </span>
      )}
      <Link
        href={b.editInvoice(invoiceId)}
        className={buttonClasses("outline", "sm")}
      >
        Edit
      </Link>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={finalize}
        disabled={busy !== null}
      >
        {busy === "finalize" ? "Marking…" : "Mark as sent"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={remove}
        disabled={busy !== null}
        className={cn("border-destructive/30 text-destructive hover:bg-destructive/10")}
      >
        {busy === "delete" ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
