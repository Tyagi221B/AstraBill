import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { getInvoice } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Invoice · AstraBill",
};

const TYPE_LABEL: Record<string, string> = {
  tax_invoice: "Tax Invoice",
  estimate: "Estimate",
  cash_receipt: "Cash Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
};

const STATUS_COLOUR: Record<string, string> = {
  draft: "#888",
  sent: "#2563eb",
  seen: "#0891b2",
  partially_paid: "#ca8a04",
  paid: "#16a34a",
  overdue: "#dc2626",
};

const card: React.CSSProperties = {
  padding: "1.25rem",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
  marginBottom: "1.25rem",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0.3rem 0",
  fontSize: "0.92rem",
};

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const invoice = await getInvoice(id, user.id);
  if (!invoice) notFound();

  const taxClass =
    Number(invoice.igstAmount) > 0 ? "interstate" : "intrastate";

  return (
    <main
      style={{
        maxWidth: 880,
        margin: "3rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Link
        href="/"
        style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}
      >
        ← Home
      </Link>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          margin: "1rem 0 2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", margin: 0 }}>{invoice.number}</h1>
          <p style={{ color: "#666", margin: "0.15rem 0 0" }}>
            {TYPE_LABEL[invoice.type] ?? invoice.type} · Issued{" "}
            {invoice.issueDate}
            {invoice.dueDate && ` · Due ${invoice.dueDate}`}
          </p>
        </div>
        <span
          style={{
            padding: "0.35rem 0.7rem",
            background: STATUS_COLOUR[invoice.status] ?? "#888",
            color: "#fff",
            borderRadius: 999,
            fontSize: "0.78rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {invoice.status.replace("_", " ")}
        </span>
      </header>

      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>Line items</h2>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.88rem",
            }}
          >
            <thead>
              <tr style={{ color: "#888", textAlign: "left" }}>
                <th style={{ padding: "0.5rem", width: "40%" }}>Description</th>
                <th style={{ padding: "0.5rem" }}>HSN</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>Qty</th>
                <th style={{ padding: "0.5rem" }}>Unit</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>Price</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>GST</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((line) => (
                  <tr key={line.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      {line.description}
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.5rem",
                        fontFamily: "monospace",
                        color: "#666",
                      }}
                    >
                      {line.hsnCode ?? "—"}
                    </td>
                    <td
                      style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}
                    >
                      {line.quantity}
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem", color: "#666" }}>
                      {line.unit}
                    </td>
                    <td
                      style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}
                    >
                      ₹ {line.unitPrice}
                    </td>
                    <td
                      style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}
                    >
                      {line.gstRate}%
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.5rem",
                        textAlign: "right",
                        fontWeight: 500,
                      }}
                    >
                      ₹ {line.amount}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...card, maxWidth: 340, marginLeft: "auto" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>Totals</h2>
        <div style={row}>
          <span style={{ color: "#666" }}>Subtotal</span>
          <span>₹ {invoice.subtotal}</span>
        </div>
        {Number(invoice.discountAmount) > 0 && (
          <div style={row}>
            <span style={{ color: "#666" }}>Discount</span>
            <span>− ₹ {invoice.discountAmount}</span>
          </div>
        )}
        <div style={row}>
          <span style={{ color: "#666" }}>Taxable</span>
          <span>₹ {invoice.taxableAmount}</span>
        </div>
        {taxClass === "intrastate" ? (
          <>
            <div style={row}>
              <span style={{ color: "#666" }}>CGST</span>
              <span>₹ {invoice.cgstAmount}</span>
            </div>
            <div style={row}>
              <span style={{ color: "#666" }}>SGST</span>
              <span>₹ {invoice.sgstAmount}</span>
            </div>
          </>
        ) : (
          <div style={row}>
            <span style={{ color: "#666" }}>IGST</span>
            <span>₹ {invoice.igstAmount}</span>
          </div>
        )}
        <div style={row}>
          <span style={{ color: "#666" }}>Round-off</span>
          <span>
            {invoice.roundOff.startsWith("-") ? "−" : "+"} ₹{" "}
            {invoice.roundOff.replace(/^-/, "")}
          </span>
        </div>
        <div
          style={{
            ...row,
            fontWeight: 700,
            fontSize: "1.05rem",
            marginTop: "0.4rem",
            borderTop: "1px solid #ddd",
            paddingTop: "0.6rem",
          }}
        >
          <span>Total</span>
          <span>₹ {invoice.total}</span>
        </div>
        <p
          style={{
            margin: "0.55rem 0 0",
            fontSize: "0.72rem",
            color: "#888",
            textAlign: "center",
          }}
        >
          {taxClass === "intrastate"
            ? "Intrastate — CGST + SGST"
            : "Interstate — IGST"}
        </p>
      </section>

      {invoice.notes && (
        <section style={card}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Notes</h2>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#444" }}>
            {invoice.notes}
          </p>
        </section>
      )}
    </main>
  );
}
