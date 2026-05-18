"use client";
/**
 * Invoice create + edit form.
 *
 * Phase 2A surface area:
 *   - Customer picker (saved customer or walk-in)
 *   - Product picker on line items (snapshots name / HSN / rate / GST)
 *   - Dual-unit per line — informational secondary qty + unit (e.g. glass
 *     billed per sqm, counted in pcs)
 *   - Ship-to fields, distinct from the bill-to customer
 *   - Extra charges list — taxable (cutting / labour) fold pre-GST; non-
 *     taxable (informal freight) add post-tax (same shape lib/gst uses)
 *   - Transport mode + vehicle number + optional e-way bill number
 *   - `delivery_challan` as a non-GST type option
 */
import { useMemo, useState, type FormEvent } from "react";
import posthog from "posthog-js";

import { INDIAN_STATES } from "@/lib/constants/indian-states";
import {
  classifyTax,
  computeInvoiceTotals,
  computeLineItem,
  type ExtraChargeInput,
} from "@/lib/gst";

type BusinessOption = {
  id: string;
  name: string;
  stateCode: string | null;
  gstin: string | null;
};

type CustomerOption = {
  id: string;
  businessId: string;
  name: string;
  stateCode: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
};

type ProductOption = {
  id: string;
  businessId: string;
  name: string;
  hsnCode: string | null;
  unit: string;
  gstRate: string;
  sellingPrice: string;
};

const UNITS = [
  "pcs",
  "sqft",
  "sqm",
  "kg",
  "linear_ft",
  "box",
  "dozen",
  "set",
] as const;
type UnitValue = (typeof UNITS)[number];

const TYPES = [
  { value: "tax_invoice", label: "Tax Invoice" },
  { value: "estimate", label: "Estimate" },
  { value: "cash_receipt", label: "Cash Receipt" },
  { value: "delivery_challan", label: "Delivery Challan (no GST)" },
] as const;
type InvoiceTypeValue = (typeof TYPES)[number]["value"];

interface LineItem {
  productId: string | null;
  description: string;
  hsnCode: string;
  quantity: string;
  unit: UnitValue;
  secondaryQuantity: string;
  secondaryUnit: UnitValue | "";
  unitPrice: string;
  discountAmount: string;
  gstRate: string;
}

interface ExtraCharge {
  label: string;
  amount: string;
  taxable: boolean;
  gstRate: string;
}

const blankLine = (): LineItem => ({
  productId: null,
  description: "",
  hsnCode: "",
  quantity: "1",
  unit: "pcs",
  secondaryQuantity: "",
  secondaryUnit: "",
  unitPrice: "0.00",
  discountAmount: "0",
  gstRate: "18",
});

const blankCharge = (): ExtraCharge => ({
  label: "",
  amount: "0.00",
  taxable: false,
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

export interface InvoiceFormInitial {
  type: InvoiceTypeValue;
  customerId: string | null;
  placeOfSupplyStateCode: string | null;
  notes: string | null;
  issueDate: string;
  dueDate: string | null;
  shipToName: string | null;
  shipToAddress: string | null;
  transportMode: string | null;
  vehicleNumber: string | null;
  ewayBillNumber: string | null;
  extraCharges: ExtraCharge[];
  lineItems: LineItem[];
}

export function InvoiceForm({
  businesses,
  customers,
  products,
  initialBusinessId,
  editingInvoiceId,
  initial,
}: {
  businesses: BusinessOption[];
  customers: CustomerOption[];
  products: ProductOption[];
  initialBusinessId: string;
  editingInvoiceId?: string;
  initial?: InvoiceFormInitial;
}) {
  const isEdit = Boolean(editingInvoiceId);

  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [type, setType] = useState<InvoiceTypeValue>(
    initial?.type ?? "tax_invoice",
  );
  const [customerId, setCustomerId] = useState<string>(
    initial?.customerId ?? "",
  );
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState(
    initial?.placeOfSupplyStateCode ?? "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [shipToName, setShipToName] = useState(initial?.shipToName ?? "");
  const [shipToAddress, setShipToAddress] = useState(
    initial?.shipToAddress ?? "",
  );
  const [transportMode, setTransportMode] = useState(
    initial?.transportMode ?? "",
  );
  const [vehicleNumber, setVehicleNumber] = useState(
    initial?.vehicleNumber ?? "",
  );
  const [ewayBillNumber, setEwayBillNumber] = useState(
    initial?.ewayBillNumber ?? "",
  );
  const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>(
    initial?.extraCharges ?? [],
  );
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initial?.lineItems && initial.lineItems.length > 0
      ? initial.lineItems
      : [blankLine()],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<unknown>(null);

  const business = businesses.find((b) => b.id === businessId)!;
  const businessCustomers = useMemo(
    () => customers.filter((c) => c.businessId === businessId),
    [customers, businessId],
  );
  const businessProducts = useMemo(
    () => products.filter((p) => p.businessId === businessId),
    [products, businessId],
  );
  const selectedCustomer = customerId
    ? businessCustomers.find((c) => c.id === customerId) ?? null
    : null;

  // For non-GST delivery challans, hide GST fields visually but the math
  // still runs at 0% (per-line gstRate). We zero the line rates client-side
  // when the user switches type → DC, so the preview matches.
  const isDeliveryChallan = type === "delivery_challan";

  // Default place of supply: explicit field → selected customer's state →
  // business's own state.
  const effectivePlaceOfSupply =
    placeOfSupplyStateCode ||
    selectedCustomer?.stateCode ||
    business.stateCode ||
    null;

  const taxClass = classifyTax(business.stateCode, effectivePlaceOfSupply);

  // ---- live totals preview --------------------------------------------

  const totals = useMemo(() => {
    try {
      const lineAmounts = lineItems.map((line) =>
        computeLineItem(
          {
            quantity: line.quantity || "0",
            unitPrice: line.unitPrice || "0",
            discountAmount: line.discountAmount || "0",
            gstRate: isDeliveryChallan ? "0" : line.gstRate || "0",
          },
          taxClass,
        ),
      );
      const combined = lineItems.map((line, i) => ({
        ...line,
        gstRate: isDeliveryChallan ? "0" : line.gstRate,
        ...lineAmounts[i]!,
      }));
      const extras: ExtraChargeInput[] = extraCharges
        .filter((c) => c.label.trim() !== "" || Number(c.amount) !== 0)
        .map((c) => ({
          amount: c.amount || "0",
          taxable: c.taxable,
          gstRate: c.taxable ? c.gstRate || "0" : undefined,
        }));
      return {
        ...computeInvoiceTotals(combined, {
          extraCharges: extras,
          taxClass,
        }),
        klass: taxClass,
      };
    } catch {
      return null;
    }
  }, [lineItems, extraCharges, taxClass, isDeliveryChallan]);

  // ---- handlers --------------------------------------------------------

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLineItems((rows) =>
      rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );
  }

  function pickProductForLine(i: number, productId: string) {
    if (!productId) {
      updateLine(i, { productId: null });
      return;
    }
    const p = businessProducts.find((p) => p.id === productId);
    if (!p) return;
    updateLine(i, {
      productId: p.id,
      description: p.name,
      hsnCode: p.hsnCode ?? "",
      unit: (UNITS as readonly string[]).includes(p.unit)
        ? (p.unit as UnitValue)
        : "pcs",
      unitPrice: p.sellingPrice,
      gstRate: p.gstRate,
    });
  }

  function addLine() {
    setLineItems((rows) => [...rows, blankLine()]);
  }
  function removeLine(i: number) {
    setLineItems((rows) =>
      rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows,
    );
  }

  function updateCharge(i: number, patch: Partial<ExtraCharge>) {
    setExtraCharges((rows) =>
      rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );
  }
  function addCharge() {
    setExtraCharges((rows) => [...rows, blankCharge()]);
  }
  function removeCharge(i: number) {
    setExtraCharges((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorDetails(null);
    try {
      const sharedFields = {
        customerId: customerId || null,
        placeOfSupplyStateCode: placeOfSupplyStateCode || null,
        notes: notes.trim() || null,
        dueDate: dueDate || null,
        shipToName: shipToName.trim() || null,
        shipToAddress: shipToAddress.trim() || null,
        transportMode: transportMode.trim() || null,
        vehicleNumber: vehicleNumber.trim() || null,
        ewayBillNumber: ewayBillNumber.trim() || null,
        extraCharges: extraCharges
          .filter((c) => c.label.trim() !== "" && Number(c.amount) !== 0)
          .map((c) => ({
            label: c.label.trim(),
            amount: c.amount,
            taxable: c.taxable,
            ...(c.taxable ? { gstRate: c.gstRate } : {}),
          })),
        lineItems: lineItems.map((l) => ({
          productId: l.productId,
          description: l.description.trim(),
          hsnCode: l.hsnCode.trim() || null,
          quantity: l.quantity,
          unit: l.unit,
          secondaryQuantity: l.secondaryQuantity.trim() || null,
          secondaryUnit: l.secondaryUnit || null,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount || "0",
          gstRate: isDeliveryChallan ? "0" : l.gstRate,
        })),
      };
      const payload = isEdit
        ? sharedFields
        : { ...sharedFields, businessId, type };
      const url = isEdit ? `/api/invoices/${editingInvoiceId}` : "/api/invoices";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
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
      const id = isEdit ? editingInvoiceId! : json.data.id;
      posthog.capture(isEdit ? "invoice_draft_updated" : "invoice_draft_created", {
        invoice_id: id,
        invoice_type: type,
        has_customer: Boolean(customerId),
        line_item_count: lineItems.length,
        has_extra_charges: extraCharges.length > 0,
        total: totals?.total ?? null,
      });
      window.location.assign(`/invoices/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      posthog.captureException(err);
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

  return (
    <form onSubmit={submit}>
      {/* ---- Header ---- */}
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
              {isEdit && (
                <span style={{ color: "#888", fontWeight: 400 }}>
                  {" "}
                  · locked
                </span>
              )}
            </label>
            <select
              id="biz"
              value={businessId}
              onChange={(e) => {
                setBusinessId(e.target.value);
                setCustomerId(""); // customer list changes with business
              }}
              disabled={isEdit}
              style={{ ...input, opacity: isEdit ? 0.7 : 1 }}
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
              {isEdit && (
                <span style={{ color: "#888", fontWeight: 400 }}>
                  {" "}
                  · locked
                </span>
              )}
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as InvoiceTypeValue)}
              disabled={isEdit}
              style={{ ...input, opacity: isEdit ? 0.7 : 1 }}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabel} htmlFor="customer">
              Customer
            </label>
            <select
              id="customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={input}
            >
              <option value="">Walk-in (no saved customer)</option>
              {businessCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.gstin ? ` · ${c.gstin}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabel} htmlFor="pos">
              Place of supply{" "}
              <span style={{ color: "#888", fontWeight: 400 }}>
                (defaults to customer or business state)
              </span>
            </label>
            <select
              id="pos"
              value={placeOfSupplyStateCode}
              onChange={(e) => setPlaceOfSupplyStateCode(e.target.value)}
              style={input}
            >
              <option value="">
                {selectedCustomer?.stateCode
                  ? `Customer — ${selectedCustomer.stateCode}`
                  : business.stateCode
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

      {/* ---- Ship-to ---- */}
      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>
          Ship-to{" "}
          <span style={{ color: "#888", fontWeight: 400 }}>
            (optional — leave blank to ship to the bill-to customer)
          </span>
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: "0.85rem",
          }}
        >
          <div>
            <label style={fieldLabel} htmlFor="shipName">
              Consignee name
            </label>
            <input
              id="shipName"
              value={shipToName}
              onChange={(e) => setShipToName(e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="shipAddr">
              Ship-to address
            </label>
            <input
              id="shipAddr"
              value={shipToAddress}
              onChange={(e) => setShipToAddress(e.target.value)}
              style={input}
            />
          </div>
        </div>
      </section>

      {/* ---- Line items ---- */}
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
                <th style={{ padding: "0.4rem 0.4rem" }}>Product</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>Description</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>HSN</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>Qty</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>Unit</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>2nd qty</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>2nd unit</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>Unit price</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>Discount</th>
                {!isDeliveryChallan && (
                  <th style={{ padding: "0.4rem 0.4rem" }}>GST %</th>
                )}
                <th />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, i) => (
                <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "0.35rem 0.3rem", minWidth: 140 }}>
                    <select
                      value={line.productId ?? ""}
                      onChange={(e) => pickProductForLine(i, e.target.value)}
                      style={input}
                    >
                      <option value="">— custom —</option>
                      {businessProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", minWidth: 200 }}>
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
                  <td style={{ padding: "0.35rem 0.3rem", width: 90 }}>
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
                  <td style={{ padding: "0.35rem 0.3rem", width: 80 }}>
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
                  <td style={{ padding: "0.35rem 0.3rem", width: 92 }}>
                    <select
                      value={line.unit}
                      onChange={(e) =>
                        updateLine(i, { unit: e.target.value as UnitValue })
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
                  <td style={{ padding: "0.35rem 0.3rem", width: 80 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.secondaryQuantity}
                      onChange={(e) =>
                        updateLine(i, { secondaryQuantity: e.target.value })
                      }
                      placeholder=""
                      style={{ ...input, textAlign: "right" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", width: 92 }}>
                    <select
                      value={line.secondaryUnit}
                      onChange={(e) =>
                        updateLine(i, {
                          secondaryUnit: e.target.value as UnitValue | "",
                        })
                      }
                      style={input}
                    >
                      <option value="">—</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", width: 110 }}>
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
                  <td style={{ padding: "0.35rem 0.3rem", width: 90 }}>
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
                  {!isDeliveryChallan && (
                    <td style={{ padding: "0.35rem 0.3rem", width: 80 }}>
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
                  )}
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>
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

      {/* ---- Extra charges ---- */}
      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.85rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", margin: 0 }}>
            Extra charges{" "}
            <span style={{ color: "#888", fontWeight: 400 }}>
              (cutting / labour / freight…)
            </span>
          </h2>
          <button type="button" onClick={addCharge} style={ghostBtn}>
            + Add charge
          </button>
        </div>
        {extraCharges.length === 0 ? (
          <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>
            None. Add taxable charges (cutting, processing) to fold into the
            taxable base, or non-taxable charges (informal freight) that ride
            on top of the rounded total.
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "#888" }}>
                <th style={{ padding: "0.4rem 0.4rem" }}>Label</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>Amount</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>Taxable</th>
                <th style={{ padding: "0.4rem 0.4rem" }}>GST %</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {extraCharges.map((c, i) => (
                <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "0.35rem 0.3rem" }}>
                    <input
                      type="text"
                      value={c.label}
                      onChange={(e) => updateCharge(i, { label: e.target.value })}
                      placeholder="e.g. Cutting charge"
                      style={input}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", width: 130 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={c.amount}
                      onChange={(e) =>
                        updateCharge(i, { amount: e.target.value })
                      }
                      style={{ ...input, textAlign: "right" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", width: 110 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={c.taxable}
                        onChange={(e) =>
                          updateCharge(i, { taxable: e.target.checked })
                        }
                      />
                      Taxable
                    </label>
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", width: 100 }}>
                    {c.taxable ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={c.gstRate}
                        onChange={(e) =>
                          updateCharge(i, { gstRate: e.target.value })
                        }
                        style={{ ...input, textAlign: "right" }}
                      />
                    ) : (
                      <span style={{ color: "#aaa", fontSize: "0.8rem" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => removeCharge(i)}
                      style={{
                        ...ghostBtn,
                        padding: "0.35rem 0.55rem",
                        color: "#c00",
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- Transport / e-way ---- */}
      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>
          Transport &amp; e-way bill{" "}
          <span style={{ color: "#888", fontWeight: 400 }}>(optional)</span>
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.85rem",
          }}
        >
          <div>
            <label style={fieldLabel} htmlFor="tmode">
              Transport mode
            </label>
            <input
              id="tmode"
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value)}
              placeholder="Road / Rail / Self pickup"
              style={input}
            />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="veh">
              Vehicle number
            </label>
            <input
              id="veh"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
              placeholder="UP 32 AB 1234"
              style={{ ...input, textTransform: "uppercase" }}
            />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="eway">
              E-way bill number
            </label>
            <input
              id="eway"
              value={ewayBillNumber}
              onChange={(e) => setEwayBillNumber(e.target.value)}
              placeholder="generated outside AstraBill"
              style={input}
            />
          </div>
        </div>
      </section>

      {/* ---- Notes + totals ---- */}
      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>
          Notes &amp; totals
        </h2>
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
                {Number(totals.extraChargesTaxable) > 0 && (
                  <div style={totalRow}>
                    <span style={{ color: "#666" }}>Taxable charges</span>
                    <span>₹ {totals.extraChargesTaxable}</span>
                  </div>
                )}
                <div style={totalRow}>
                  <span style={{ color: "#666" }}>Taxable</span>
                  <span>₹ {totals.taxableAmount}</span>
                </div>
                {!isDeliveryChallan && totals.klass === "intrastate" ? (
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
                ) : !isDeliveryChallan ? (
                  <div style={totalRow}>
                    <span style={{ color: "#666" }}>IGST</span>
                    <span>₹ {totals.igstAmount}</span>
                  </div>
                ) : null}
                <div style={totalRow}>
                  <span style={{ color: "#666" }}>Round-off</span>
                  <span>
                    {totals.roundOff.startsWith("-") ? "−" : "+"} ₹{" "}
                    {totals.roundOff.replace(/^-/, "")}
                  </span>
                </div>
                {Number(totals.extraChargesNonTaxable) > 0 && (
                  <div style={totalRow}>
                    <span style={{ color: "#666" }}>Freight / non-taxable</span>
                    <span>+ ₹ {totals.extraChargesNonTaxable}</span>
                  </div>
                )}
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
                  {isDeliveryChallan
                    ? "Delivery challan — no GST"
                    : totals.klass === "intrastate"
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
          {busy
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save changes"
              : "Create draft"}
        </button>
      </div>
    </form>
  );
}
