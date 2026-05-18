"use client";
/**
 * Action buttons for an invoice detail page. For V1 these only appear on
 * DRAFT invoices — Edit, Mark as sent (finalise), Delete. Once an invoice is
 * finalised it's immutable, so there are no actions to show (until the
 * WhatsApp-send / payment features land).
 */
import { useState } from "react";

const ghostBtn: React.CSSProperties = {
  padding: "0.4rem 0.85rem",
  fontSize: "0.85rem",
  borderRadius: 6,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#333",
  textDecoration: "none",
  cursor: "pointer",
};

export function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const [busy, setBusy] = useState<null | "finalize" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

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
      window.location.assign("/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
      {error && (
        <span style={{ color: "#c00", fontSize: "0.8rem", marginRight: "0.25rem" }}>
          {error}
        </span>
      )}
      <a href={`/invoices/${invoiceId}/edit`} style={ghostBtn}>
        Edit
      </a>
      <button
        type="button"
        onClick={finalize}
        disabled={busy !== null}
        style={{
          ...ghostBtn,
          borderColor: "#111",
          background: "#111",
          color: "#fff",
          opacity: busy !== null ? 0.6 : 1,
        }}
      >
        {busy === "finalize" ? "Marking…" : "Mark as sent"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy !== null}
        style={{
          ...ghostBtn,
          borderColor: "#f0caca",
          color: "#c00",
          opacity: busy !== null ? 0.6 : 1,
        }}
      >
        {busy === "delete" ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
