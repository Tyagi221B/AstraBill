"use client";
/**
 * Customer create + edit form. The same component drives both flows — pass
 * `editingCustomerId` to switch into edit mode, which locks the business
 * selector and routes the submit to PATCH /api/customers/[id].
 */
import { useState, type FormEvent } from "react";

import { INDIAN_STATES } from "@/lib/constants/indian-states";

type BusinessOption = { id: string; name: string; stateCode: string | null };

export interface CustomerFormInitial {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateCode: string;
  pincode: string;
  notes: string;
}

const blank: CustomerFormInitial = {
  name: "",
  phone: "",
  email: "",
  gstin: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateCode: "",
  pincode: "",
  notes: "",
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

export function CustomerForm({
  businesses,
  initialBusinessId,
  editingCustomerId,
  initial,
}: {
  businesses: BusinessOption[];
  initialBusinessId: string;
  editingCustomerId?: string;
  initial?: CustomerFormInitial;
}) {
  const isEdit = Boolean(editingCustomerId);
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [f, setF] = useState<CustomerFormInitial>(initial ?? blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CustomerFormInitial>(
    key: K,
    value: CustomerFormInitial[K],
  ) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, string | null | undefined> = {
        name: f.name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        gstin: f.gstin.trim() ? f.gstin.trim().toUpperCase() : null,
        addressLine1: f.addressLine1.trim() || null,
        addressLine2: f.addressLine2.trim() || null,
        city: f.city.trim() || null,
        stateCode: f.stateCode || null,
        pincode: f.pincode.trim() || null,
        notes: f.notes.trim() || null,
      };
      const url = isEdit
        ? `/api/customers/${editingCustomerId}`
        : "/api/customers";
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
      window.location.assign(`/customers?businessId=${businessId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>Basics</h2>
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
            <label style={label} htmlFor="phone">
              Phone (WhatsApp)
            </label>
            <input
              id="phone"
              value={f.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="98765 43210"
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={f.email}
              onChange={(e) => set("email", e.target.value)}
              style={input}
            />
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>
          GST &amp; address
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.85rem",
          }}
        >
          <div>
            <label style={label} htmlFor="gstin">
              GSTIN
            </label>
            <input
              id="gstin"
              value={f.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              placeholder="15-char GSTIN (optional)"
              style={{ ...input, textTransform: "uppercase" }}
            />
          </div>
          <div>
            <label style={label} htmlFor="state">
              State
            </label>
            <select
              id="state"
              value={f.stateCode}
              onChange={(e) => set("stateCode", e.target.value)}
              style={input}
            >
              <option value="">— select —</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={label} htmlFor="addr1">
              Address line 1
            </label>
            <input
              id="addr1"
              value={f.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              style={input}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={label} htmlFor="addr2">
              Address line 2
            </label>
            <input
              id="addr2"
              value={f.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="city">
              City
            </label>
            <input
              id="city"
              value={f.city}
              onChange={(e) => set("city", e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="pin">
              Pincode
            </label>
            <input
              id="pin"
              value={f.pincode}
              onChange={(e) => set("pincode", e.target.value)}
              style={input}
            />
          </div>
        </div>
      </section>

      <section style={card}>
        <label style={label} htmlFor="notes">
          Notes (internal)
        </label>
        <textarea
          id="notes"
          rows={3}
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
          style={{ ...input, resize: "vertical" }}
        />
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
            : "Create customer"}
      </button>
    </form>
  );
}
