"use client";
/**
 * DocumentForm — the single form that creates / edits all 8 doc types.
 *
 * Same UX shape as a sales invoice; behaviour and labels switch on the
 * `docType` prop:
 *   - "Bill to" / "Bill from" header label
 *   - Original supplier inv no. fields (purchase_invoice, debit_note)
 *   - "Validity date" instead of "Due date" (quotation, estimate)
 *
 * Save flow:
 *   "Save as draft"  → POST/PATCH /api/documents
 *   "Save & finalise" → POST then POST /api/documents/[id]/finalise
 *
 * Totals on screen are a client-side preview (decimal.js); server runs the
 * authoritative math (lib/gst.ts) on save.
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
import type { DocTypeValue, Item, Party, PartyAddress } from "@/lib/db/schema";
import { routes } from "@/lib/routes";

function formatAddressLine(a: PartyAddress): string {
  return [
    a.streetAddress,
    [a.city, a.state, a.pincode].filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join("\n");
}

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
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

/** Per-doc-type label / behaviour. Pure data — no logic. */
export interface DocTypeUiConfig {
  /** Human title in the form header. */
  title: string;
  /** Header label for the party block. */
  partyLabel: string;
  /** Label for the due-date field. */
  dueDateLabel: string;
  /** Label for the payment-terms field. */
  paymentTermsLabel: string;
  /** If true, the form surfaces Original Doc Number / Date inputs. */
  showsOriginalDoc: boolean;
  /** If true, surface a Bill-to / Ship-to address block and ship-to override
   *  picker. Today only `sales_invoice` uses this; other sales docs like
   *  quotation / delivery_challan can opt in later when we extend the model. */
  usesShipTo: boolean;
  /** Route to return to on save success. */
  detailRoute: (businessId: string, id: string) => string;
}

const TYPE_CONFIGS: Record<DocTypeValue, DocTypeUiConfig> = {
  sales_invoice: {
    title: "sales invoice",
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
    paymentTermsLabel: "Payment terms (days)",
    showsOriginalDoc: false,
    usesShipTo: true,
    detailRoute: (b, id) => routes.b(b).salesInvoice(id),
  },
  estimate: {
    title: "estimate",
    partyLabel: "Bill to",
    dueDateLabel: "Validity date",
    paymentTermsLabel: "Valid for (days)",
    showsOriginalDoc: false,
    usesShipTo: false,
    detailRoute: (b, id) => `/b/${b}/sales/estimates/${id}`,
  },
  delivery_challan: {
    title: "delivery challan",
    partyLabel: "Deliver to",
    dueDateLabel: "Delivery date",
    paymentTermsLabel: "Delivery in (days)",
    showsOriginalDoc: false,
    usesShipTo: false,
    detailRoute: (b, id) => `/b/${b}/sales/delivery-challans/${id}`,
  },
  credit_note: {
    title: "credit note",
    partyLabel: "Bill to (customer)",
    dueDateLabel: "Due date",
    paymentTermsLabel: "Payment terms (days)",
    showsOriginalDoc: false,
    usesShipTo: false,
    detailRoute: (b, id) => routes.b(b).creditNote(id),
  },
  purchase_invoice: {
    title: "purchase invoice",
    partyLabel: "Bill from (supplier)",
    dueDateLabel: "Due date",
    paymentTermsLabel: "Payment terms (days)",
    showsOriginalDoc: true,
    usesShipTo: false,
    detailRoute: (b, id) => routes.b(b).purchaseInvoice(id),
  },
  debit_note: {
    title: "debit note",
    partyLabel: "Bill from (supplier)",
    dueDateLabel: "Due date",
    paymentTermsLabel: "Payment terms (days)",
    showsOriginalDoc: true,
    usesShipTo: false,
    detailRoute: (b, id) => routes.b(b).debitNote(id),
  },
  quotation: {
    title: "quotation",
    partyLabel: "Quote to",
    dueDateLabel: "Validity date",
    paymentTermsLabel: "Valid for (days)",
    showsOriginalDoc: false,
    usesShipTo: false,
    detailRoute: (b, id) => routes.b(b).quotation(id),
  },
  proforma_invoice: {
    title: "proforma invoice",
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
    paymentTermsLabel: "Payment terms (days)",
    showsOriginalDoc: false,
    usesShipTo: false,
    detailRoute: (b, id) => `/b/${b}/sales/proforma-invoices/${id}`,
  },
};

export interface LineDraft {
  itemId: string;
  itemName: string;
  hsn: string;
  unit: string;
  qty: string;
  price: string;
  gstRate: string;
  discountPercent: string;
}

export const blankLine = (): LineDraft => ({
  itemId: "",
  itemName: "",
  hsn: "",
  unit: "PCS",
  qty: "1",
  price: "0",
  gstRate: "18",
  discountPercent: "",
});

export interface DocumentFormInitial {
  partyId: string;
  docDate: string;
  paymentTermsDays: string;
  dueDate: string;
  placeOfSupplyStateCode: string;
  originalDocNumber: string;
  originalDocDate: string;
  notes: string;
  termsConditions: string;
  lines: LineDraft[];
  /** Only meaningful when the doc type's `usesShipTo` is true.
   *  `null` = ship-to is the party's billing address (the V1 default). */
  shipToAddressId: string | null;
}

const blankInitial = (defaults: {
  docDate: string;
  termsConditions: string;
  partyId?: string;
}): DocumentFormInitial => ({
  partyId: defaults.partyId ?? "",
  docDate: defaults.docDate,
  paymentTermsDays: "30",
  dueDate: "",
  placeOfSupplyStateCode: "",
  originalDocNumber: "",
  originalDocDate: "",
  notes: "",
  termsConditions: defaults.termsConditions,
  lines: [blankLine()],
  shipToAddressId: null,
});

export function DocumentForm({
  businessId,
  businessStateCode,
  docType,
  parties,
  items,
  editingId,
  initial,
  defaultTermsConditions,
}: {
  businessId: string;
  businessStateCode: string | null;
  docType: DocTypeValue;
  parties: Party[];
  items: Item[];
  editingId?: string;
  initial?: DocumentFormInitial;
  defaultTermsConditions: string;
}) {
  const cfg = TYPE_CONFIGS[docType];
  const isEdit = Boolean(editingId);
  const [f, setF] = useState<DocumentFormInitial>(
    initial ??
      blankInitial({
        docDate: new Date().toISOString().slice(0, 10),
        termsConditions: defaultTermsConditions,
      }),
  );
  const [busy, setBusy] = useState(false);
  /** Party billing + shipping addresses for the ship-to picker. Only fetched
   *  when `cfg.usesShipTo` is true. `null` until first fetch resolves. */
  const [partyAddrs, setPartyAddrs] = useState<{
    billing: PartyAddress | null;
    shippingAddresses: PartyAddress[];
  } | null>(null);

  // Fetch addresses when the picked party changes (ship-to doc types only).
  // Auto-selects the party's default shipping on first load.
  useEffect(() => {
    if (!cfg.usesShipTo || !f.partyId) {
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
              data: {
                billing: PartyAddress | null;
                shippingAddresses: PartyAddress[];
              };
            }
          | { ok: false; error: { message: string } };
        if (cancelled || !json.ok) return;
        setPartyAddrs(json.data);
        if (f.shipToAddressId === null) {
          const def = json.data.shippingAddresses.find((s) => s.isDefault);
          if (def) {
            setF((prev) =>
              prev.shipToAddressId === null
                ? { ...prev, shipToAddressId: def.id }
                : prev,
            );
          }
        }
      } catch {
        // Block just doesn't render — saving still works.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.partyId, cfg.usesShipTo]);

  function set<K extends keyof DocumentFormInitial>(
    key: K,
    value: DocumentFormInitial[K],
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
    if (!it) return;
    setLine(idx, {
      itemId,
      itemName: it.name,
      hsn: it.hsnSacCode ?? "",
      unit: it.measuringUnitCode ?? "PCS",
      // For purchase docs, prefer purchase_price; for sales, sales_price.
      price:
        docType === "purchase_invoice" || docType === "debit_note"
          ? it.purchasePrice ?? it.salesPrice ?? "0"
          : it.salesPrice ?? "0",
      gstRate: it.gstRate ?? "",
    });
  }

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
      const disc = gross
        .times(new Decimal(line.discountPercent || "0"))
        .div(100);
      totalDiscount = totalDiscount.plus(disc);
      const lineTaxable = gross.minus(disc);
      taxable = taxable.plus(lineTaxable);
      if (line.gstRate) {
        const rate = new Decimal(line.gstRate);
        const lineTax = lineTaxable.times(rate).div(100);
        tax = tax.plus(lineTax);
        if (isInterstate) igst = igst.plus(lineTax);
        else {
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
    if (lines.length === 0) throw new Error("Add at least one line item");
    if (!f.partyId) throw new Error("Pick a party");
    if (cfg.showsOriginalDoc && !f.originalDocNumber.trim()) {
      throw new Error("Original supplier invoice number is required for ITC");
    }
    return {
      docType,
      docDate: f.docDate,
      partyId: f.partyId,
      paymentTermsDays: Number(f.paymentTermsDays) || null,
      dueDate: f.dueDate || null,
      placeOfSupplyStateCode: f.placeOfSupplyStateCode || null,
      originalDocNumber: f.originalDocNumber.trim() || null,
      originalDocDate: f.originalDocDate || null,
      termsConditions: f.termsConditions || null,
      notes: f.notes || null,
      ...(cfg.usesShipTo ? { shipToAddressId: f.shipToAddressId } : {}),
      lines,
    };
  }

  async function save(finalise: boolean) {
    setBusy(true);
    try {
      const payload = buildPayload();
      const url = isEdit ? `/api/documents/${editingId}` : "/api/documents";
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
        toast.success(`${cfg.title} ${fjson.data.docNumber} finalised`);
      } else {
        toast.success(isEdit ? "Saved" : "Draft created");
      }
      window.location.assign(cfg.detailRoute(businessId, docId));
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
    () => parties.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [parties],
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold capitalize">
            {cfg.title} details
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="party">
                {cfg.partyLabel} <span className="text-destructive">*</span>
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
                Date <span className="text-destructive">*</span>
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
              <Label htmlFor="terms">{cfg.paymentTermsLabel}</Label>
              <Input
                id="terms"
                type="number"
                min={0}
                value={f.paymentTermsDays}
                onChange={(e) => set("paymentTermsDays", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="due">{cfg.dueDateLabel}</Label>
              <Input
                id="due"
                type="date"
                value={f.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
            {cfg.showsOriginalDoc && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="orig-no">
                    Supplier's invoice # <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="orig-no"
                    value={f.originalDocNumber}
                    onChange={(e) => set("originalDocNumber", e.target.value)}
                    placeholder="Required for ITC claim"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="orig-date">Supplier's invoice date</Label>
                  <Input
                    id="orig-date"
                    type="date"
                    value={f.originalDocDate}
                    onChange={(e) => set("originalDocDate", e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {cfg.usesShipTo && f.partyId && partyAddrs?.billing && (
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
                {partyAddrs.shippingAddresses.length === 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Same as billing
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add a shipping address from the party's edit page to
                      pick it here.
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      value={f.shipToAddressId ?? ""}
                      onChange={(e) =>
                        set("shipToAddressId", e.target.value || null)
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                    >
                      <option value="">— Same as billing —</option>
                      {partyAddrs.shippingAddresses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {(s.label ?? "(no label)") +
                            (s.isDefault ? " · default" : "")}
                        </option>
                      ))}
                    </select>
                    {f.shipToAddressId &&
                      (() => {
                        const picked = partyAddrs.shippingAddresses.find(
                          (s) => s.id === f.shipToAddressId,
                        );
                        if (!picked) return null;
                        return (
                          <address className="mt-2 not-italic text-sm leading-relaxed text-foreground whitespace-pre-line">
                            {formatAddressLine(picked)}
                          </address>
                        );
                      })()}
                  </>
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
                          onChange={(e) => setLine(idx, { itemName: e.target.value })}
                          placeholder="or free-text"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 font-mono text-xs"
                          value={line.hsn}
                          onChange={(e) => setLine(idx, { hsn: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 text-right tabular-nums"
                          value={line.qty}
                          onChange={(e) => setLine(idx, { qty: e.target.value })}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 w-20 text-xs"
                          value={line.unit}
                          onChange={(e) => setLine(idx, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 text-right tabular-nums"
                          value={line.price}
                          onChange={(e) => setLine(idx, { price: e.target.value })}
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
                <Label htmlFor="notes">Notes</Label>
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
              Server recomputes on save — persisted figure is authoritative.
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
        <Button type="submit" variant="outline" size="lg" disabled={busy}>
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
