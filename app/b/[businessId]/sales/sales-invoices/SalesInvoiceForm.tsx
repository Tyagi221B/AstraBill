"use client";
/**
 * Sales invoice create + edit form. Same component drives both flows.
 *
 * Save flow:
 *   "Save as draft" → POST /api/documents (or PATCH if editing)
 *   "Save & finalise" → POST followed by POST /api/documents/[id]/finalise
 *
 * Totals on screen are a client-side preview; the server runs the
 * authoritative math on save (lib/gst.ts) and persists the result.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import Decimal from "decimal.js";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import type { Item, Party, PartyAddress } from "@/lib/db/schema";
import { routes } from "@/lib/routes";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const COMPACT_SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

const GST_OPTIONS: Array<{ label: string; value: string | null }> = [
  { label: "Exempt", value: null },
  { label: "0%", value: "0" },
  { label: "0.1%", value: "0.1" },
  { label: "0.25%", value: "0.25" },
  { label: "1.5%", value: "1.5" },
  { label: "3%", value: "3" },
  { label: "5%", value: "5" },
  { label: "12%", value: "12" },
  { label: "18%", value: "18" },
  { label: "28%", value: "28" },
];

export interface LineDraft {
  itemId: string;
  itemName: string;
  hsn: string;
  unit: string;
  qty: string;
  price: string;
  /** GST rate as string; empty string = exempt (null at the API boundary). */
  gstRate: string;
  discountPercent: string;
}

const blankLine = (): LineDraft => ({
  itemId: "",
  itemName: "",
  hsn: "",
  unit: "PCS",
  qty: "1",
  price: "0",
  gstRate: "18",
  discountPercent: "",
});

export interface SalesInvoiceFormInitial {
  partyId: string;
  docDate: string;
  paymentTermsDays: string;
  dueDate: string;
  placeOfSupplyStateCode: string;
  notes: string;
  termsConditions: string;
  lines: LineDraft[];
  /** When non-null, this is the `party_addresses.id` to use as ship-to.
   *  Null means "ship-to == bill-to" (the V1 default; ~95% of invoices). */
  shipToAddressId: string | null;
}

const blank = (defaults: {
  docDate: string;
  termsConditions: string;
  partyId?: string;
}): SalesInvoiceFormInitial => ({
  partyId: defaults.partyId ?? "",
  docDate: defaults.docDate,
  paymentTermsDays: "30",
  dueDate: "",
  placeOfSupplyStateCode: "",
  notes: "",
  termsConditions: defaults.termsConditions,
  lines: [blankLine()],
  shipToAddressId: null,
});

function formatAddressLine(a: PartyAddress): string {
  return [
    a.streetAddress,
    [a.city, a.state, a.pincode].filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function SalesInvoiceForm({
  businessId,
  businessStateCode,
  parties,
  items,
  editingId,
  initial,
  defaultTermsConditions,
}: {
  businessId: string;
  businessStateCode: string | null;
  parties: Party[];
  items: Item[];
  editingId?: string;
  initial?: SalesInvoiceFormInitial;
  defaultTermsConditions: string;
}) {
  const isEdit = Boolean(editingId);
  const [f, setF] = useState<SalesInvoiceFormInitial>(
    initial ??
      blank({
        docDate: new Date().toISOString().slice(0, 10),
        termsConditions: defaultTermsConditions,
      }),
  );
  const [busy, setBusy] = useState(false);
  const [partyAddrs, setPartyAddrs] = useState<{
    billing: PartyAddress | null;
    shipping: PartyAddress | null;
  } | null>(null);

  // Fetch the picked party's billing + default shipping addresses. The
  // form starts with ship-to == bill-to; the toggle below lets the user
  // override only when the party has a saved default shipping.
  useEffect(() => {
    if (!f.partyId) {
      setPartyAddrs(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/parties/${f.partyId}/addresses`);
        const json = (await res.json()) as
          | {
              ok: true;
              data: { billing: PartyAddress | null; shipping: PartyAddress | null };
            }
          | { ok: false; error: { message: string } };
        if (!cancelled && json.ok) {
          setPartyAddrs(json.data);
        }
      } catch {
        // Silent — block just doesn't render; saving still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [f.partyId]);

  function set<K extends keyof SalesInvoiceFormInitial>(
    key: K,
    value: SalesInvoiceFormInitial[K],
  ) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setF((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  }

  function addLine() {
    setF((prev) => ({ ...prev, lines: [...prev.lines, blankLine()] }));
  }

  function removeLine(idx: number) {
    setF((prev) => ({
      ...prev,
      lines: prev.lines.length === 1 ? prev.lines : prev.lines.filter((_, i) => i !== idx),
    }));
  }

  function pickItem(idx: number, itemId: string) {
    if (!itemId) {
      setLine(idx, { itemId: "", itemName: "" });
      return;
    }
    const it = items.find((x) => x.id === itemId);
    if (!it) {
      setLine(idx, { itemId });
      return;
    }
    setLine(idx, {
      itemId,
      itemName: it.name,
      hsn: it.hsnSacCode ?? "",
      unit: it.measuringUnitCode ?? "PCS",
      price: it.salesPrice ?? "0",
      gstRate: it.gstRate ?? "",
    });
  }

  // Client-side preview math. Server is authoritative on save.
  const totals = useMemo(() => {
    let subtotal = new Decimal(0);
    let totalDiscount = new Decimal(0);
    let taxable = new Decimal(0);
    let tax = new Decimal(0);
    let cgst = new Decimal(0);
    let sgst = new Decimal(0);
    let igst = new Decimal(0);

    const isInterstate =
      Boolean(businessStateCode) &&
      Boolean(f.placeOfSupplyStateCode) &&
      businessStateCode !== f.placeOfSupplyStateCode;

    for (const line of f.lines) {
      const qty = new Decimal(line.qty || "0");
      const price = new Decimal(line.price || "0");
      const gross = qty.times(price);
      subtotal = subtotal.plus(gross);
      const discPct = new Decimal(line.discountPercent || "0");
      const disc = gross.times(discPct).div(100);
      totalDiscount = totalDiscount.plus(disc);
      const lineTaxable = gross.minus(disc);
      taxable = taxable.plus(lineTaxable);
      if (line.gstRate) {
        const rate = new Decimal(line.gstRate);
        const lineTax = lineTaxable.times(rate).div(100);
        tax = tax.plus(lineTax);
        if (isInterstate) {
          igst = igst.plus(lineTax);
        } else {
          const half = lineTax.div(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          cgst = cgst.plus(half);
          sgst = sgst.plus(lineTax.minus(half));
        }
      }
    }
    const preRound = taxable.plus(tax);
    const grandTotal = preRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const roundOff = grandTotal.minus(preRound);
    return {
      subtotal: subtotal.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      taxable: taxable.toFixed(2),
      tax: tax.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      roundOff: roundOff.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
      isInterstate,
    };
  }, [f.lines, f.placeOfSupplyStateCode, businessStateCode]);

  function buildPayload() {
    const lines = f.lines
      .filter((l) => l.itemName.trim() !== "" && Number(l.qty) > 0)
      .map((l) => ({
        itemId: l.itemId || null,
        itemNameSnapshot: l.itemName.trim(),
        hsnSacCodeSnapshot: l.hsn.trim() || null,
        unitCodeSnapshot: l.unit || null,
        quantity: l.qty,
        pricePerUnit: l.price,
        priceIncludesTax: false,
        discountPercent: l.discountPercent || null,
        discountAmount: "0",
        gstRate: l.gstRate || null,
      }));
    if (lines.length === 0) {
      throw new Error("Add at least one line item");
    }
    if (!f.partyId) {
      throw new Error("Pick a party");
    }
    return {
      docType: "sales_invoice" as const,
      docDate: f.docDate,
      partyId: f.partyId,
      paymentTermsDays: Number(f.paymentTermsDays) || null,
      dueDate: f.dueDate || null,
      placeOfSupplyStateCode: f.placeOfSupplyStateCode || null,
      termsConditions: f.termsConditions || null,
      notes: f.notes || null,
      shipToAddressId: f.shipToAddressId,
      lines,
    };
  }

  async function save(finalise: boolean) {
    setBusy(true);
    try {
      const payload = buildPayload();
      const url = isEdit
        ? `/api/documents/${editingId}`
        : "/api/documents";
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
        toast.error(json.error.message);
        return;
      }
      const docId = isEdit ? editingId! : json.data.id;
      if (finalise) {
        const fres = await fetch(`/api/documents/${docId}/finalise`, {
          method: "POST",
        });
        const fjson = (await fres.json()) as
          | { ok: true; data: { docNumber: string } }
          | { ok: false; error: { message: string } };
        if (!fjson.ok) {
          toast.error(fjson.error.message);
          return;
        }
        toast.success(`Invoice ${fjson.data.docNumber} finalised`);
      } else {
        toast.success(isEdit ? "Saved" : "Draft created");
      }
      window.location.assign(routes.b(businessId).salesInvoice(docId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save(false);
  }

  const partyOptions = useMemo(
    () =>
      parties
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [parties],
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Invoice details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="party">
                Bill to <span className="text-destructive">*</span>
              </Label>
              <select
                id="party"
                value={f.partyId}
                onChange={(e) => set("partyId", e.target.value)}
                className={SELECT_CLASS}
                required
              >
                <option value="">— select party —</option>
                {partyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="state">Place of supply</Label>
              <select
                id="state"
                value={f.placeOfSupplyStateCode}
                onChange={(e) => set("placeOfSupplyStateCode", e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— intrastate default —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">
                Invoice date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="date"
                type="date"
                value={f.docDate}
                onChange={(e) => set("docDate", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="terms">Payment terms (days)</Label>
              <Input
                id="terms"
                type="number"
                min={0}
                value={f.paymentTermsDays}
                onChange={(e) => set("paymentTermsDays", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={f.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {f.partyId && partyAddrs?.billing && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Bill to
                </h2>
                <address className="not-italic text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {formatAddressLine(partyAddrs.billing)}
                </address>
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Ship to
                </h2>
                {partyAddrs.shipping ? (
                  f.shipToAddressId ? (
                    <>
                      <address className="not-italic text-sm leading-relaxed text-foreground whitespace-pre-line">
                        {formatAddressLine(partyAddrs.shipping)}
                      </address>
                      <button
                        type="button"
                        onClick={() => set("shipToAddressId", null)}
                        className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Use billing instead
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Same as billing
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          partyAddrs.shipping &&
                          set("shipToAddressId", partyAddrs.shipping.id)
                        }
                        className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Use saved shipping address
                      </button>
                    </>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Same as billing
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Line items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Item / description</th>
                  <th className="px-2 py-2 font-medium">HSN</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="px-2 py-2 text-right font-medium">Price</th>
                  <th className="px-2 py-2 text-right font-medium">Disc %</th>
                  <th className="px-2 py-2 font-medium">GST</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {f.lines.map((line, idx) => {
                  const lineAmount = new Decimal(line.qty || "0")
                    .times(line.price || "0")
                    .times(
                      new Decimal(1).minus(
                        new Decimal(line.discountPercent || "0").div(100),
                      ),
                    )
                    .times(
                      line.gstRate
                        ? new Decimal(1).plus(
                            new Decimal(line.gstRate).div(100),
                          )
                        : new Decimal(1),
                    )
                    .toFixed(2);
                  return (
                    <tr key={idx} className="border-t border-border align-top">
                      <td className="px-2 py-2">
                        <select
                          className={COMPACT_SELECT}
                          value={line.itemId}
                          onChange={(e) => pickItem(idx, e.target.value)}
                        >
                          <option value="">— pick item —</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name}
                              {it.code ? ` · ${it.code}` : ""}
                            </option>
                          ))}
                        </select>
                        <Input
                          className="mt-1 h-8 text-sm"
                          value={line.itemName}
                          onChange={(e) =>
                            setLine(idx, { itemName: e.target.value })
                          }
                          placeholder="or free-text"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 font-mono text-xs"
                          value={line.hsn}
                          onChange={(e) =>
                            setLine(idx, { hsn: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 text-right tabular-nums"
                          value={line.qty}
                          onChange={(e) =>
                            setLine(idx, { qty: e.target.value })
                          }
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 w-20 text-xs"
                          value={line.unit}
                          onChange={(e) =>
                            setLine(idx, { unit: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 text-right tabular-nums"
                          value={line.price}
                          onChange={(e) =>
                            setLine(idx, { price: e.target.value })
                          }
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 w-16 text-right tabular-nums"
                          value={line.discountPercent}
                          onChange={(e) =>
                            setLine(idx, { discountPercent: e.target.value })
                          }
                          inputMode="decimal"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className={COMPACT_SELECT}
                          value={line.gstRate}
                          onChange={(e) =>
                            setLine(idx, { gstRate: e.target.value })
                          }
                        >
                          {GST_OPTIONS.map((g) => (
                            <option key={g.label} value={g.value ?? ""}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        ₹ {lineAmount}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={f.lines.length === 1}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              + Add line
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Notes &amp; terms</h2>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Notes (visible to customer)</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={f.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tc">Terms &amp; conditions</Label>
                <Textarea
                  id="tc"
                  rows={4}
                  value={f.termsConditions}
                  onChange={(e) => set("termsConditions", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Totals</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right tabular-nums">₹ {totals.subtotal}</dd>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="text-right tabular-nums">
                − ₹ {totals.totalDiscount}
              </dd>
              <dt className="text-muted-foreground">Taxable</dt>
              <dd className="text-right tabular-nums">₹ {totals.taxable}</dd>
              {totals.isInterstate ? (
                <>
                  <dt className="text-muted-foreground">IGST</dt>
                  <dd className="text-right tabular-nums">₹ {totals.igst}</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted-foreground">CGST</dt>
                  <dd className="text-right tabular-nums">₹ {totals.cgst}</dd>
                  <dt className="text-muted-foreground">SGST</dt>
                  <dd className="text-right tabular-nums">₹ {totals.sgst}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Round off</dt>
              <dd className="text-right tabular-nums">₹ {totals.roundOff}</dd>
              <dt className="border-t border-border pt-2 text-base font-semibold">
                Grand total
              </dt>
              <dd className="border-t border-border pt-2 text-right text-base font-semibold tabular-nums">
                ₹ {totals.grandTotal}
              </dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Server recomputes on save — the persisted figure is authoritative.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => window.history.back()}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="outline"
          size="lg"
          disabled={busy}
        >
          {busy ? "Saving…" : isEdit ? "Save draft" : "Save as draft"}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={() => save(true)}
          disabled={busy}
        >
          {busy ? "Working…" : isEdit ? "Save & finalise" : "Create & finalise"}
        </Button>
      </div>
    </form>
  );
}
