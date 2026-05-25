"use client";
/**
 * InvoiceSettingsEditor — per-doc-type numbering + default T&C editor.
 *
 * Two surfaces in one page:
 *   - Numbering: prefix / next-sequence / sequence-template / reset-each-FY
 *     per doc type for the CURRENT FY. POSTs to
 *     /api/document-counters/seed which is upsert + safety-checks-backwards.
 *   - Default T&C: a textarea per doc type, stored on
 *     `businesses.doc_type_defaults` and printed on every new doc unless
 *     overridden inline. PATCHes /api/businesses/[id]/profile.
 *
 * The "Reduce sequence below already-issued number" failure is surfaced as
 * a per-card error (server rejects with 403 + a friendly message).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DocTypeValue } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

// ---- types -------------------------------------------------------------

type CounterRow = {
  docType: DocTypeValue;
  fyYear: string;
  prefix: string;
  sequenceTemplate: string;
  nextSequence: number;
  resetEachFy: boolean;
};

type CounterDraft = Omit<CounterRow, "fyYear">;

export interface InvoiceSettingsInitial {
  /** Current-FY counter row per doc type. Missing = never finalised → use
   *  client-side default; the seed POST will lazily create it. */
  countersByType: Partial<Record<DocTypeValue, CounterRow>>;
  /** Per-doc-type default T&C (and any future per-type field). */
  docTypeDefaults: Partial<Record<DocTypeValue, { termsConditions?: string }>>;
  fyYear: string;
}

const DOC_TYPE_ORDER: DocTypeValue[] = [
  "sales_invoice",
  "purchase_invoice",
  "quotation",
  "estimate",
  "proforma_invoice",
  "delivery_challan",
  "credit_note",
  "debit_note",
];

const DOC_TYPE_LABELS: Record<DocTypeValue, string> = {
  sales_invoice: "Sales Invoice",
  purchase_invoice: "Purchase Invoice",
  quotation: "Quotation",
  estimate: "Estimate",
  proforma_invoice: "Proforma Invoice",
  delivery_challan: "Delivery Challan",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
};

const DEFAULT_PREFIX_BY_TYPE: Record<DocTypeValue, string> = {
  sales_invoice: "INV-",
  purchase_invoice: "PI-",
  quotation: "QT-",
  estimate: "EST-",
  proforma_invoice: "PF-",
  delivery_challan: "DC-",
  credit_note: "CN-",
  debit_note: "DN-",
};

// ---- preview helper (mirrors lib/services/document-counters renderTemplate) ----

function renderPreview(
  template: string,
  ctx: { prefix: string; fyYear: string; sequence: number },
): string {
  return template
    .replace(/\{PREFIX\}/g, ctx.prefix)
    .replace(/\{FY\}/g, ctx.fyYear)
    .replace(/\{SEQ:(\d+)\}/g, (_m, n: string) =>
      String(ctx.sequence).padStart(Number(n), "0"),
    );
}

// ---- component ---------------------------------------------------------

export function InvoiceSettingsEditor({
  businessId,
  canEdit,
  initial,
}: {
  businessId: string;
  canEdit: boolean;
  initial: InvoiceSettingsInitial;
}) {
  const initialDrafts = useMemo<Record<DocTypeValue, CounterDraft>>(() => {
    const map = {} as Record<DocTypeValue, CounterDraft>;
    for (const t of DOC_TYPE_ORDER) {
      const row = initial.countersByType[t];
      map[t] = {
        docType: t,
        prefix: row?.prefix ?? DEFAULT_PREFIX_BY_TYPE[t],
        sequenceTemplate: row?.sequenceTemplate ?? "{PREFIX}{SEQ:3}",
        nextSequence: row?.nextSequence ?? 1,
        resetEachFy: row?.resetEachFy ?? true,
      };
    }
    return map;
  }, [initial.countersByType]);

  const initialTerms = useMemo<Record<DocTypeValue, string>>(() => {
    const map = {} as Record<DocTypeValue, string>;
    for (const t of DOC_TYPE_ORDER) {
      map[t] = initial.docTypeDefaults[t]?.termsConditions ?? "";
    }
    return map;
  }, [initial.docTypeDefaults]);

  const [savedCounters, setSavedCounters] =
    useState<Record<DocTypeValue, CounterDraft>>(initialDrafts);
  const [counters, setCounters] =
    useState<Record<DocTypeValue, CounterDraft>>(initialDrafts);

  const [savedTerms, setSavedTerms] =
    useState<Record<DocTypeValue, string>>(initialTerms);
  const [terms, setTerms] =
    useState<Record<DocTypeValue, string>>(initialTerms);

  const [busy, setBusy] = useState(false);
  const [perTypeErrors, setPerTypeErrors] = useState<
    Partial<Record<DocTypeValue, string>>
  >({});

  const dirty = useMemo(
    () =>
      JSON.stringify(counters) !== JSON.stringify(savedCounters) ||
      JSON.stringify(terms) !== JSON.stringify(savedTerms),
    [counters, terms, savedCounters, savedTerms],
  );

  // The hard lower-bound for nextSequence: the server-recorded value for
  // already-issued numbers. Editing below this surfaces a friendly inline
  // warning *before* the user clicks save.
  const minSequenceForType = (t: DocTypeValue): number =>
    initial.countersByType[t]?.nextSequence ?? 1;

  function patchCounter(t: DocTypeValue, p: Partial<CounterDraft>) {
    setCounters((prev) => ({ ...prev, [t]: { ...prev[t], ...p } }));
    if (perTypeErrors[t]) {
      setPerTypeErrors((prev) => ({ ...prev, [t]: undefined }));
    }
  }

  async function save() {
    setBusy(true);
    setPerTypeErrors({});
    try {
      // ---- 1) counters (only changed types) ----
      const changedSeeds: Array<{
        docType: DocTypeValue;
        startSequence: number;
        prefix: string;
        sequenceTemplate: string;
        resetEachFy: boolean;
      }> = [];
      for (const t of DOC_TYPE_ORDER) {
        if (
          JSON.stringify(counters[t]) !== JSON.stringify(savedCounters[t])
        ) {
          changedSeeds.push({
            docType: t,
            startSequence: counters[t].nextSequence,
            prefix: counters[t].prefix,
            sequenceTemplate: counters[t].sequenceTemplate,
            resetEachFy: counters[t].resetEachFy,
          });
        }
      }
      if (changedSeeds.length > 0) {
        const res = await fetch("/api/document-counters/seed", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ businessId, seeds: changedSeeds }),
        });
        const json = (await res.json()) as
          | { ok: true }
          | { ok: false; error: { message: string } };
        if (!json.ok) {
          // The service returns one message at a time (first failing seed).
          // We don't know *which* seed it referred to, but the message
          // contains the doc type — match by substring and pin it.
          const msg = json.error.message;
          const pinTo = DOC_TYPE_ORDER.find((t) => msg.includes(t));
          if (pinTo) {
            setPerTypeErrors((prev) => ({ ...prev, [pinTo]: msg }));
          }
          throw new Error(msg);
        }
      }

      // ---- 2) docTypeDefaults (only if any T&C changed) ----
      const termsChanged = JSON.stringify(terms) !== JSON.stringify(savedTerms);
      if (termsChanged) {
        const docTypeDefaults: Record<DocTypeValue, { termsConditions: string }> = {} as Record<DocTypeValue, { termsConditions: string }>;
        for (const t of DOC_TYPE_ORDER) {
          docTypeDefaults[t] = { termsConditions: terms[t] };
        }
        const res2 = await fetch(`/api/businesses/${businessId}/profile`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ docTypeDefaults }),
        });
        const json2 = (await res2.json()) as
          | { ok: true }
          | { ok: false; error: { message: string } };
        if (!json2.ok) throw new Error(json2.error.message);
      }

      setSavedCounters(counters);
      setSavedTerms(terms);
      toast.success("Invoice settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save changes",
      );
    } finally {
      setBusy(false);
    }
  }

  const locked = !canEdit;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">
            Invoice Settings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Number format and default terms for each document type. Changes
            apply to documents you finalise from now on — already-issued
            numbers never change.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Current FY: <span className="font-mono">{initial.fyYear}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {dirty && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => {
                setCounters(savedCounters);
                setTerms(savedTerms);
                setPerTypeErrors({});
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={locked || busy || !dirty}
            onClick={save}
          >
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {locked && (
        <div
          role="status"
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          Only an owner can change invoice settings. You can view the current
          values below.
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Numbering
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DOC_TYPE_ORDER.map((t) => (
            <CounterCard
              key={t}
              docType={t}
              draft={counters[t]}
              minSequence={minSequenceForType(t)}
              fyYear={initial.fyYear}
              disabled={locked}
              error={perTypeErrors[t]}
              onChange={(p) => patchCounter(t, p)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Default Terms &amp; Conditions
        </h3>
        <p className="-mt-2 text-xs text-muted-foreground">
          Printed at the bottom of every new document of this type. You can
          still override it per-document. Use{" "}
          <span className="font-mono">[CITY]</span> to insert your business
          city automatically.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DOC_TYPE_ORDER.map((t) => (
            <Card key={t}>
              <CardContent className="pt-6">
                <Label htmlFor={`tc-${t}`} className="text-sm font-semibold">
                  {DOC_TYPE_LABELS[t]}
                </Label>
                <Textarea
                  id={`tc-${t}`}
                  value={terms[t]}
                  disabled={locked}
                  onChange={(e) =>
                    setTerms((prev) => ({ ...prev, [t]: e.target.value }))
                  }
                  rows={3}
                  className="mt-2"
                  placeholder="Leave blank to print nothing"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---- per-doc-type counter card ----------------------------------------

function CounterCard({
  docType,
  draft,
  minSequence,
  fyYear,
  disabled,
  error,
  onChange,
}: {
  docType: DocTypeValue;
  draft: CounterDraft;
  minSequence: number;
  fyYear: string;
  disabled: boolean;
  error?: string;
  onChange: (p: Partial<CounterDraft>) => void;
}) {
  const belowMin = draft.nextSequence < minSequence;
  const preview = renderPreview(draft.sequenceTemplate, {
    prefix: draft.prefix,
    fyYear,
    sequence: draft.nextSequence,
  });
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">{DOC_TYPE_LABELS[docType]}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Next number:{" "}
              <span className="font-mono text-foreground">{preview}</span>
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`prefix-${docType}`}>Prefix</Label>
            <Input
              id={`prefix-${docType}`}
              value={draft.prefix}
              disabled={disabled}
              onChange={(e) => onChange({ prefix: e.target.value })}
              maxLength={20}
              className="font-mono"
              placeholder="INV-"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`seq-${docType}`}>Next Number</Label>
            <Input
              id={`seq-${docType}`}
              type="number"
              min={1}
              value={draft.nextSequence}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  nextSequence: Math.max(1, Number(e.target.value) || 1),
                })
              }
              aria-invalid={belowMin || undefined}
              className={cn(belowMin && "border-destructive")}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor={`tpl-${docType}`}>Format</Label>
          <Input
            id={`tpl-${docType}`}
            value={draft.sequenceTemplate}
            disabled={disabled}
            onChange={(e) => onChange({ sequenceTemplate: e.target.value })}
            maxLength={80}
            className="font-mono text-xs"
            placeholder="{PREFIX}{SEQ:3}"
          />
          <p className="text-[10px] text-muted-foreground">
            Tokens:{" "}
            <span className="font-mono">{"{PREFIX}"}</span>,{" "}
            <span className="font-mono">{"{FY}"}</span>,{" "}
            <span className="font-mono">{"{SEQ:N}"}</span> (zero-padded to N
            digits)
          </p>
        </div>
        <label
          className={cn(
            "mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2",
            disabled && "opacity-60",
          )}
        >
          <span className="text-xs">
            <span className="block font-medium">Reset each financial year</span>
            <span className="block text-muted-foreground">
              Auto-reset to 1 on the 1st of FY start month.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={draft.resetEachFy}
            disabled={disabled}
            onChange={(e) => onChange({ resetEachFy: e.target.checked })}
          />
        </label>
        {belowMin && (
          <p className="mt-2 text-xs text-destructive">
            Already issued at least {minSequence - 1} document(s) in this FY —
            can&rsquo;t go below {minSequence}.
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
