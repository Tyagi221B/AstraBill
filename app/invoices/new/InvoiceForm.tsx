"use client";
/**
 * Invoice create form — minimum viable:
 *   - Select business, type, optional place-of-supply, optional notes/dueDate
 *   - 1+ line items (description, qty, unit, unitPrice, gstRate, opt. HSN/discount)
 *   - Live total preview using the SAME lib/gst math the server uses
 *
 * V1 punts (deliberately deferred):
 *   - Customer selection / inline create
 *   - Product catalogue (line items are all custom for now)
 *   - PDF preview
 */
import { useMemo, useState, type FormEvent } from "react";

import { INDIAN_STATES } from "@/lib/constants/indian-states";
import {
  classifyTax,
  computeInvoiceTotals,
  computeLineItem,
} from "@/lib/gst";

type BusinessOption = {
  id: string;
  name: string;
  stateCode: string | null;
  gstin: string | null;
};

const UNITS = ["sqft", "kg", "pcs", "linear_ft", "box", "dozen"] as const;
const TYPES = [
  { value: "tax_invoice", label: "Tax Invoice" },
  { value: "estimate", label: "Estimate" },
  { value: "cash_receipt", label: "Cash Receipt" },
] as const;

interface LineItem {
  description: string;
  hsnCode: string;
  quantity: string;
  unit: (typeof UNITS)[number];
  unitPrice: string;
  discountAmount: string;
  gstRate: string;
}

const blankLine = (): LineItem => ({
  description: "",
  hsnCode: "",
  quantity: "1",
  unit: "pcs",
  unitPrice: "0.00",
  discountAmount: "0",
  gstRate: "18",
});

// ---- styles -------------------------------------------------------------

const card: React.CSSProperties = {
  padding: "1.25rem",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
  marginBottom: "1.25rem",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  marginBottom: "0.35rem",
  fontWeight: 500,
  color: "#444",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  fontSize: "0.95rem",
  borderRadius: 6,
  border: "1px solid #ddd",
  background: "#fff",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding: "0.75rem 1.25rem",
  fontSize: "1rem",
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "0.5rem 0.85rem",
  fontSize: "0.85rem",
  borderRadius: 6,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  color: "#333",
};

const totalRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0.25rem 0",
  fontSize: "0.9rem",
};

// ---- form ---------------------------------------------------------------

export function InvoiceForm({
  businesses,
  initialBusinessId,
}: {
  businesses: BusinessOption[];
  initialBusinessId: string;
}) {
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>(
    "tax_invoice",
  );
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLine()]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<unknown>(null);

  const business = businesses.find((b) => b.id === businessId)!;

  // Default place of supply to the business's own state if not yet set.
  const effectivePlaceOfSupply =
    placeOfSupplyStateCode || business.stateCode || null;

  // ---- live totals preview (uses the same math the server runs) --------

  const totals = useMemo(() => {
    try {
      const klass = classifyTax(business.stateCode, effectivePlaceOfSupply);
      const lineAmounts = lineItems.map((line) =>
        computeLineItem(
          {
            quantity: line.quantity || "0",
            unitPrice: line.unitPrice || "0",
            discountAmount: line.discountAmount || "0",
            gstRate: line.gstRate || "0",
          },
          klass,
        ),
      );
      const combined = lineItems.map((line, i) => ({
        ...line,
        ...lineAmounts[i]!,
      }));
      return { ...computeInvoiceTotals(combined), klass };
    } catch {
      // While the user is mid-edit we may have invalid strings — fall back
      // to zeros rather than crashing the preview.
      return null;
    }
  }, [lineItems, business.stateCode, effectivePlaceOfSupply]);

  // ---- handlers --------------------------------------------------------

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLineItems((rows) =>
      rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );
  }

  function addLine() {
    setLineItems((rows) => [...rows, blankLine()]);
  }

  function removeLine(i: number) {
    setLineItems((rows) =>
      rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows,
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorDetails(null);
    try {
      const payload = {
        businessId,
        type,
        placeOfSupplyStateCode: placeOfSupplyStateCode || null,
        notes: notes.trim() || null,
        dueDate: dueDate || null,
        lineItems: lineItems.map((l) => ({
          description: l.description.trim(),
          hsnCode: l.hsnCode.trim() || null,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount || "0",
          gstRate: l.gstRate,
        })),
      };
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as
        | { ok: true; data: { id: string } }
        | { ok: false; error: { message: string; details?: unknown } };
      if (!json.ok) {
        setError(json.error.message);
        setErrorDetails(json.error.details);
        return;
      }
      window.location.assign(`/invoices/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const submitDisabled =
    busy ||
    lineItems.length === 0 ||
    lineItems.some(
      (l) =>
        !l.description.trim() ||
        Number(l.quantity) <= 0 ||
        Number(l.unitPrice) < 0,
    );

  // ---- render ----------------------------------------------------------

  return (
    <form onSubmit={submit}>
      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>Header</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.85rem",
          }}
        >
          <div>
            <label style={fieldLabel} htmlFor="biz">
              Business
            </label>
            <select
              id="biz"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              style={input}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.stateCode ? ` (${b.stateCode})` : " (no state set)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabel} htmlFor="type">
              Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as (typeof TYPES)[number]["value"])
              }
              style={input}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabel} htmlFor="pos">
              Place of supply{" "}
              <span style={{ color: "#888", fontWeight: 400 }}>
                (defaults to business state)
              </span>
            </label>
            <select
              id="pos"
              value={placeOfSupplyStateCode}
              onChange={(e) => setPlaceOfSupplyStateCode(e.target.value)}
              style={input}
            >
              <option value="">
                {business.stateCode
                  ? `Same as business — ${business.stateCode}`
                  : "— Select —"}
              </option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabel} htmlFor="due">
              Due date{" "}
              <span style={{ color: "#888", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={input}
            />
          </div>
        </div>
      </section>

      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.85rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Line items</h2>
          <button type="button" onClick={addLine} style={ghostBtn}>
            + Add line
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "#888" }}>
                <th style={{ padding: "0.4rem 0.5rem", width: "32%" }}>
                  Description
                </th>
                <th style={{ padding: "0.4rem 0.5rem", width: "9%" }}>HSN</th>
                <th style={{ padding: "0.4rem 0.5rem", width: "9%" }}>Qty</th>
                <th style={{ padding: "0.4rem 0.5rem", width: "10%" }}>Unit</th>
                <th style={{ padding: "0.4rem 0.5rem", width: "12%" }}>
                  Unit price
                </th>
                <th style={{ padding: "0.4rem 0.5rem", width: "10%" }}>
                  Discount
                </th>
                <th style={{ padding: "0.4rem 0.5rem", width: "9%" }}>
                  GST %
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, i) => (
                <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) =>
                        updateLine(i, { description: e.target.value })
                      }
                      placeholder="e.g. 5mm glass cut to size"
                      style={input}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input
                      type="text"
                      value={line.hsnCode}
                      onChange={(e) =>
                        updateLine(i, { hsnCode: e.target.value })
                      }
                      maxLength={20}
                      style={{ ...input, fontFamily: "monospace" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(i, { quantity: e.target.value })
                      }
                      style={{ ...input, textAlign: "right" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <select
                      value={line.unit}
                      onChange={(e) =>
                        updateLine(i, {
                          unit: e.target.value as LineItem["unit"],
                        })
                      }
                      style={input}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(i, { unitPrice: e.target.value })
                      }
                      style={{ ...input, textAlign: "right" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.discountAmount}
                      onChange={(e) =>
                        updateLine(i, { discountAmount: e.target.value })
                      }
                      style={{ ...input, textAlign: "right" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.gstRate}
                      onChange={(e) =>
                        updateLine(i, { gstRate: e.target.value })
                      }
                      style={{ ...input, textAlign: "right" }}
                    />
                  </td>
                  <td
                    style={{
                      padding: "0.35rem 0.4rem",
                      textAlign: "right",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lineItems.length === 1}
                      title={
                        lineItems.length === 1
                          ? "An invoice needs at least one line"
                          : "Remove this line"
                      }
                      style={{
                        ...ghostBtn,
                        padding: "0.35rem 0.55rem",
                        color: lineItems.length === 1 ? "#bbb" : "#c00",
                        cursor:
                          lineItems.length === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>Notes & totals</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 280px",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          <div>
            <label style={fieldLabel} htmlFor="notes">
              Notes{" "}
              <span style={{ color: "#888", fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              style={{ ...input, resize: "vertical", minHeight: 110 }}
              placeholder="Anything the customer should see on the invoice."
            />
          </div>
          <div
            style={{
              padding: "0.85rem 1rem",
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #eee",
            }}
          >
            {totals ? (
              <>
                <div style={totalRow}>
                  <span style={{ color: "#666" }}>Subtotal</span>
                  <span>₹ {totals.subtotal}</span>
                </div>
                {Number(totals.discountAmount) > 0 && (
                  <div style={totalRow}>
                    <span style={{ color: "#666" }}>Discount</span>
                    <span>− ₹ {totals.discountAmount}</span>
                  </div>
                )}
                <div style={totalRow}>
                  <span style={{ color: "#666" }}>Taxable</span>
                  <span>₹ {totals.taxableAmount}</span>
                </div>
                {totals.klass === "intrastate" ? (
                  <>
                    <div style={totalRow}>
                      <span style={{ color: "#666" }}>CGST</span>
                      <span>₹ {totals.cgstAmount}</span>
                    </div>
                    <div style={totalRow}>
                      <span style={{ color: "#666" }}>SGST</span>
                      <span>₹ {totals.sgstAmount}</span>
                    </div>
                  </>
                ) : (
                  <div style={totalRow}>
                    <span style={{ color: "#666" }}>IGST</span>
                    <span>₹ {totals.igstAmount}</span>
                  </div>
                )}
                <div style={totalRow}>
                  <span style={{ color: "#666" }}>Round-off</span>
                  <span>
                    {totals.roundOff.startsWith("-") ? "−" : "+"} ₹{" "}
                    {totals.roundOff.replace(/^-/, "")}
                  </span>
                </div>
                <div
                  style={{
                    ...totalRow,
                    fontWeight: 700,
                    fontSize: "1rem",
                    marginTop: "0.4rem",
                    borderTop: "1px solid #ddd",
                    paddingTop: "0.55rem",
                  }}
                >
                  <span>Total</span>
                  <span>₹ {totals.total}</span>
                </div>
                <p
                  style={{
                    margin: "0.6rem 0 0",
                    fontSize: "0.72rem",
                    color: "#888",
                    textAlign: "center",
                  }}
                >
                  {totals.klass === "intrastate"
                    ? "Intrastate — CGST + SGST"
                    : "Interstate — IGST"}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#888" }}>
                Fill in the line items to preview the total.
              </p>
            )}
          </div>
        </div>
      </section>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {error && (
          <div style={{ marginRight: "auto", color: "#c00", fontSize: "0.9rem" }}>
            <div>{error}</div>
            {errorDetails ? (
              <pre
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.72rem",
                  background: "#fff5f5",
                  padding: "0.4rem 0.55rem",
                  borderRadius: 6,
                  maxWidth: 420,
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(errorDetails, null, 2)}
              </pre>
            ) : null}
          </div>
        )}
        <a href="/" style={ghostBtn}>
          Cancel
        </a>
        <button
          type="submit"
          disabled={submitDisabled}
          style={{
            ...primaryBtn,
            opacity: submitDisabled ? 0.6 : 1,
            cursor: submitDisabled ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Creating…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}
