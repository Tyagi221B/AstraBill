"use client";
/**
 * 3-step onboarding wizard (per decision/full-ledger-pivot):
 *   1. Business setup — name + state + city + GSTIN.
 *   2. Numbering seed — start sequences for every doc type, current FY.
 *      Default 1; lets a mid-year onboarder continue their offline
 *      numbering without later backfill.
 *   3. First party prompt — add one customer/supplier now, or skip.
 *
 * Steps progress via local state. POST /api/businesses on step 1, POST
 * /api/document-counters/seed on step 2, POST /api/parties on step 3
 * (optional). Finally redirects to the new business's dashboard.
 */
import { useState, type FormEvent } from "react";
import posthog from "posthog-js";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import type { DocTypeValue } from "@/lib/db/schema";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

interface DocTypeRow {
  docType: DocTypeValue;
  label: string;
  defaultPrefix: string;
}

const DOC_TYPES: DocTypeRow[] = [
  { docType: "sales_invoice", label: "Sales invoice", defaultPrefix: "INV-" },
  { docType: "quotation", label: "Quotation", defaultPrefix: "QT-" },
  { docType: "credit_note", label: "Credit note", defaultPrefix: "CN-" },
  { docType: "purchase_invoice", label: "Purchase invoice", defaultPrefix: "PI-" },
  { docType: "debit_note", label: "Debit note", defaultPrefix: "DN-" },
];

export function OnboardingForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [city, setCity] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(null);

  // Step 2
  const [seeds, setSeeds] = useState<Record<DocTypeValue, { prefix: string; start: string }>>(() => {
    const init: Record<string, { prefix: string; start: string }> = {};
    for (const t of DOC_TYPES) init[t.docType] = { prefix: t.defaultPrefix, start: "1" };
    return init as Record<DocTypeValue, { prefix: string; start: string }>;
  });

  // Step 3
  const [partyName, setPartyName] = useState("");
  const [partyType, setPartyType] = useState<"customer" | "supplier">("customer");
  const [partyMobile, setPartyMobile] = useState("");

  async function submitStep1(e: FormEvent) {
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
          city: city.trim() || null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { business: { id: string } } }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      posthog.capture("business_created", {
        has_state: Boolean(stateCode),
        has_gstin: Boolean(gstin.trim()),
      });
      setBusinessId(json.data.business.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function submitStep2() {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      const payloadSeeds = DOC_TYPES.map((row) => ({
        docType: row.docType,
        startSequence: Number(seeds[row.docType].start) || 1,
        prefix: seeds[row.docType].prefix.trim(),
      }));
      const res = await fetch("/api/document-counters/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, seeds: payloadSeeds }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function submitStep3(skip: boolean) {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      if (!skip && partyName.trim()) {
        const res = await fetch("/api/parties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            type: partyType,
            name: partyName.trim(),
            mobileNumber: partyMobile.trim() || null,
          }),
        });
        const json = (await res.json()) as
          | { ok: true }
          | { ok: false; error: { message: string } };
        if (!json.ok) throw new Error(json.error.message);
      }
      window.location.assign(`/b/${businessId}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid grid-cols-3 gap-2 text-xs">
        {[
          { n: 1, label: "Business" },
          { n: 2, label: "Numbering" },
          { n: 3, label: "First party" },
        ].map((s) => (
          <li
            key={s.n}
            className={`rounded-md border px-3 py-2 ${
              step === s.n
                ? "border-primary bg-primary/5 text-primary"
                : step > s.n
                  ? "border-green-700/30 bg-green-700/5 text-green-700 dark:border-green-400/30 dark:bg-green-400/5 dark:text-green-400"
                  : "border-input bg-background text-muted-foreground"
            }`}
          >
            <span className="font-medium">Step {s.n}</span>
            <p>{s.label}</p>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <form onSubmit={submitStep1} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="biz-name">
              Business name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="biz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Hardware"
              required
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="biz-state">State</Label>
              <select
                id="biz-state"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— select state —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="biz-city">City</Label>
              <Input
                id="biz-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Roorkee"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="biz-gstin">
              GSTIN <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="biz-gstin"
              value={gstin}
              onChange={(e) =>
                setGstin(e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase())
              }
              placeholder="15-character GSTIN"
              maxLength={15}
              className="font-mono"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={busy || name.trim().length === 0}
            className="w-full"
          >
            {busy ? "Creating…" : "Continue →"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Pick your prefix and the next number you want each doc type to
            issue. If you've already issued some invoices on paper, start the
            counter from there.
          </p>
          <div className="flex flex-col gap-3">
            {DOC_TYPES.map((row) => (
              <div
                key={row.docType}
                className="grid grid-cols-[1.2fr_1fr_1fr] items-center gap-3"
              >
                <Label className="text-sm font-medium">{row.label}</Label>
                <Input
                  value={seeds[row.docType].prefix}
                  onChange={(e) =>
                    setSeeds((prev) => ({
                      ...prev,
                      [row.docType]: {
                        ...prev[row.docType],
                        prefix: e.target.value,
                      },
                    }))
                  }
                  placeholder="Prefix"
                  className="font-mono"
                />
                <Input
                  value={seeds[row.docType].start}
                  onChange={(e) =>
                    setSeeds((prev) => ({
                      ...prev,
                      [row.docType]: {
                        ...prev[row.docType],
                        start: e.target.value,
                      },
                    }))
                  }
                  inputMode="numeric"
                  placeholder="Start at"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Counter resets on 1st April every FY by default — change later in
            Settings if you want a continuous counter.
          </p>
          <div className="flex justify-between">
            <Button variant="ghost" size="lg" onClick={() => setStep(1)} disabled={busy}>
              ← Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={submitStep2}
              disabled={busy}
            >
              {busy ? "Saving…" : "Continue →"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Add your first party now (a customer you sell to, or a supplier
            you buy from). You can always add more later.
          </p>
          <div className="flex flex-col gap-2">
            <Label>Party type</Label>
            <div className="flex gap-2">
              {(["customer", "supplier"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPartyType(t)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
                    partyType === t
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="party-name">Name</Label>
            <Input
              id="party-name"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="e.g. Asmit Glass Works"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="party-mobile">Mobile</Label>
            <Input
              id="party-mobile"
              value={partyMobile}
              onChange={(e) => setPartyMobile(e.target.value)}
              placeholder="98765 43210"
            />
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" size="lg" onClick={() => submitStep3(true)} disabled={busy}>
              {busy ? "Saving…" : "Skip for now →"}
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => submitStep3(false)}
              disabled={busy || !partyName.trim()}
            >
              {busy ? "Saving…" : "Add party & finish →"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
