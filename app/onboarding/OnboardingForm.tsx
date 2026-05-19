"use client";
/**
 * Onboarding form — minimum viable business profile.
 * Required: business name.
 * Optional but encouraged: state (drives intrastate vs interstate GST math),
 * GSTIN (only for registered businesses). Everything else lives in settings.
 */
import { useState, type FormEvent } from "react";
import posthog from "posthog-js";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INDIAN_STATES } from "@/lib/constants/indian-states";

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
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="biz-name">
          Business name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="biz-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ramesh Hardware"
          required
          maxLength={200}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="biz-state">
          State
          <span className="font-normal text-muted-foreground">
            (you can add this later)
          </span>
        </Label>
        <select
          id="biz-state"
          value={stateCode}
          onChange={(e) => setStateCode(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <option value="">— Select state —</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Drives whether invoices use CGST+SGST (same state) or IGST (different
          state). Needed before your first GST invoice.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="biz-gstin">
          GSTIN
          <span className="font-normal text-muted-foreground">
            (optional — only if registered)
          </span>
        </Label>
        <Input
          id="biz-gstin"
          type="text"
          value={gstin}
          onChange={(e) =>
            setGstin(e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase())
          }
          placeholder="15-character GSTIN"
          maxLength={15}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Leave blank if you&apos;re not GST-registered — you can still send
          Cash Receipts and Estimates.
        </p>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy || name.trim().length === 0}
        className="w-full"
      >
        {busy ? "Creating…" : "Create business"}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
