"use client";
/**
 * Onboarding form — minimum viable business profile.
 * Required: business name.
 * Optional but encouraged: state (drives intrastate vs interstate GST math),
 * GSTIN (only for registered businesses). Everything else lives in settings.
 */
import { useState, type FormEvent } from "react";
import posthog from "posthog-js";

import { INDIAN_STATES } from "@/lib/constants/indian-states";

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.875rem",
  marginBottom: "0.4rem",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  fontSize: "1rem",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "0.85rem 1rem",
  fontSize: "1rem",
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  marginTop: "0.5rem",
};

const helpText: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "#888",
  margin: "0.25rem 0 0",
};

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          stateCode: stateCode || null,
          gstin: gstin.trim().toUpperCase() || null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string; details?: unknown } };
      if (!json.ok) throw new Error(json.error.message);
      posthog.capture("business_created", {
        has_state: Boolean(stateCode),
        has_gstin: Boolean(gstin.trim()),
      });
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="biz-name" style={fieldLabel}>
          Business name <span style={{ color: "#c00" }}>*</span>
        </label>
        <input
          id="biz-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ramesh Hardware"
          required
          maxLength={200}
          autoFocus
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="biz-state" style={fieldLabel}>
          State{" "}
          <span style={{ color: "#888", fontWeight: 400 }}>
            (you can add this later)
          </span>
        </label>
        <select
          id="biz-state"
          value={stateCode}
          onChange={(e) => setStateCode(e.target.value)}
          style={inputStyle}
        >
          <option value="">— Select state —</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <p style={helpText}>
          Drives whether invoices use CGST+SGST (same state) or IGST
          (different state). Needed before your first GST invoice.
        </p>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="biz-gstin" style={fieldLabel}>
          GSTIN{" "}
          <span style={{ color: "#888", fontWeight: 400 }}>
            (optional — only if registered)
          </span>
        </label>
        <input
          id="biz-gstin"
          type="text"
          value={gstin}
          onChange={(e) =>
            setGstin(e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase())
          }
          placeholder="15-character GSTIN"
          maxLength={15}
          style={{ ...inputStyle, fontFamily: "monospace" }}
        />
        <p style={helpText}>
          Leave blank if you&apos;re not GST-registered — you can still send
          Cash Receipts and Estimates.
        </p>
      </div>

      <button
        type="submit"
        disabled={busy || name.trim().length === 0}
        style={{
          ...primaryBtn,
          opacity: busy || name.trim().length === 0 ? 0.6 : 1,
          cursor:
            busy || name.trim().length === 0 ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Creating…" : "Create business"}
      </button>

      {error && (
        <p style={{ color: "#c00", marginTop: "0.75rem", fontSize: "0.9rem" }}>
          {error}
        </p>
      )}
    </form>
  );
}
