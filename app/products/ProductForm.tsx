"use client";
/**
 * Product create + edit form. `editingProductId` switches into edit mode
 * (business + initial selection are locked; submit goes to PATCH).
 *
 * `canSeePurchasePrice` controls whether the purchase-price field is rendered
 * at all. Salesman / viewer roles never see this field — the server also
 * refuses to expose it (defense in depth).
 */
import { useState, type FormEvent } from "react";

type BusinessOption = { id: string; name: string };

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

export interface ProductFormInitial {
  name: string;
  hsnCode: string;
  unit: (typeof UNITS)[number];
  gstRate: string;
  purchasePrice: string;
  sellingPrice: string;
  stock: string;
  lowStockThreshold: string;
  isActive: boolean;
}

const blank: ProductFormInitial = {
  name: "",
  hsnCode: "",
  unit: "pcs",
  gstRate: "18",
  purchasePrice: "",
  sellingPrice: "0.00",
  stock: "0",
  lowStockThreshold: "",
  isActive: true,
};

const card: React.CSSProperties = {
  padding: "1.25rem",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
  marginBottom: "1.25rem",
};
const label: React.CSSProperties = {
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

export function ProductForm({
  businesses,
  initialBusinessId,
  editingProductId,
  initial,
  canSeePurchasePrice,
}: {
  businesses: BusinessOption[];
  initialBusinessId: string;
  editingProductId?: string;
  initial?: ProductFormInitial;
  canSeePurchasePrice: boolean;
}) {
  const isEdit = Boolean(editingProductId);
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [f, setF] = useState<ProductFormInitial>(initial ?? blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductFormInitial>(
    key: K,
    value: ProductFormInitial[K],
  ) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: f.name.trim(),
        hsnCode: f.hsnCode.trim() || null,
        unit: f.unit,
        gstRate: f.gstRate,
        sellingPrice: f.sellingPrice,
        stock: f.stock,
        lowStockThreshold: f.lowStockThreshold.trim() || null,
        isActive: f.isActive,
      };
      if (canSeePurchasePrice) {
        payload.purchasePrice = f.purchasePrice.trim() || null;
      }
      const url = isEdit
        ? `/api/products/${editingProductId}`
        : "/api/products";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit ? payload : { ...payload, businessId };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as
        | { ok: true; data: { id: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      window.location.assign(`/products?businessId=${businessId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>Product</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.85rem",
          }}
        >
          <div>
            <label style={label} htmlFor="biz">
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
              onChange={(e) => setBusinessId(e.target.value)}
              disabled={isEdit}
              style={{ ...input, opacity: isEdit ? 0.7 : 1 }}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="name">
              Name *
            </label>
            <input
              id="name"
              required
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="hsn">
              HSN code
            </label>
            <input
              id="hsn"
              value={f.hsnCode}
              onChange={(e) => set("hsnCode", e.target.value)}
              placeholder="e.g. 7003"
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="unit">
              Unit
            </label>
            <select
              id="unit"
              value={f.unit}
              onChange={(e) =>
                set("unit", e.target.value as ProductFormInitial["unit"])
              }
              style={input}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>
          Pricing &amp; stock
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.85rem",
          }}
        >
          <div>
            <label style={label} htmlFor="gstRate">
              GST rate %
            </label>
            <input
              id="gstRate"
              value={f.gstRate}
              onChange={(e) => set("gstRate", e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="sell">
              Selling price *
            </label>
            <input
              id="sell"
              required
              value={f.sellingPrice}
              onChange={(e) => set("sellingPrice", e.target.value)}
              style={input}
            />
          </div>
          {canSeePurchasePrice && (
            <div>
              <label style={label} htmlFor="buy">
                Purchase price
              </label>
              <input
                id="buy"
                value={f.purchasePrice}
                onChange={(e) => set("purchasePrice", e.target.value)}
                placeholder="optional"
                style={input}
              />
            </div>
          )}
          <div>
            <label style={label} htmlFor="stock">
              Stock on hand
            </label>
            <input
              id="stock"
              value={f.stock}
              onChange={(e) => set("stock", e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="low">
              Low-stock alert
            </label>
            <input
              id="low"
              value={f.lowStockThreshold}
              onChange={(e) => set("lowStockThreshold", e.target.value)}
              placeholder="optional"
              style={input}
            />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.9rem",
                color: "#444",
              }}
            >
              <input
                type="checkbox"
                checked={f.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              Active (selectable in invoices)
            </label>
          </div>
        </div>
      </section>

      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: 8,
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !f.name.trim()}
        style={{
          padding: "0.75rem 1.25rem",
          fontSize: "1rem",
          fontWeight: 600,
          borderRadius: 8,
          border: "1px solid #111",
          background: busy ? "#666" : "#111",
          color: "#fff",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy
          ? isEdit
            ? "Saving…"
            : "Creating…"
          : isEdit
            ? "Save changes"
            : "Create product"}
      </button>
    </form>
  );
}
