"use client";
/**
 * DocumentForm — the single form that creates / edits all 8 doc types.
 *
 * Layout matches myBillBook's Create Sales Invoice surface (PR7-H):
 *   - sticky top bar with title + Save & New + Save
 *   - 60/40 header: Bill-to card (party picker modal) | invoice meta cluster
 *   - line items table with sticky header + dashed "+ Add Item" / Scan Barcode
 *   - 50/50 footer: notes/T&C/bank/QR/signatory left, totals/payment right
 *
 * Per-doc-type behaviour comes from TYPE_CONFIGS:
 *   - "Bill to" / "Bill from" / "Quote to" header label
 *   - Original supplier inv no. fields (purchase_invoice, debit_note)
 *   - "Validity date" instead of "Due date" (quotation, estimate)
 *   - Ship-to picker (sales_invoice only today)
 *
 * Save flow today:
 *   "Save" → POST/PATCH /api/documents → POST /api/documents/[id]/finalise
 * Amount Received + Mark-as-paid are captured in local state today;
 * atomic write to /api/payment-entries lands in a follow-up commit.
 *
 * Totals on screen are a client-side preview (decimal.js); server runs the
 * authoritative math (lib/gst.ts) on save.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trash2, X } from "lucide-react";
import Decimal from "decimal.js";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import type {
  Business,
  DocTypeValue,
  Item,
  ItemCategory,
  MoneyAccount,
  PartyAddress,
} from "@/lib/db/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

import {
  PartyPickerModal,
  type PickerParty,
} from "./PartyPickerModal";
import {
  ItemPickerModal,
  type PickedItem,
} from "./ItemPickerModal";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";
const COMPACT_INPUT =
  "h-9 rounded-md border border-input bg-background px-2 text-sm";

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

const PAYMENT_MODE_OPTIONS: Array<{
  value: "cash" | "upi" | "bank_transfer" | "card" | "cheque" | "other";
  label: string;
}> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

function formatAddressLine(a: PartyAddress): string {
  return [
    a.streetAddress,
    [a.city, a.state, a.pincode].filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join("\n");
}

const inr = (n: string | Decimal) =>
  new Decimal(n).toNumber().toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* ------------------------------------------------------------------ */
/* Per-doc-type config                                                 */
/* ------------------------------------------------------------------ */

export interface DocTypeUiConfig {
  /** Human title in the form header (capitalised by CSS). */
  title: string;
  /** Header label for the party block. */
  partyLabel: string;
  /** Default party type for the quick-add flow. */
  defaultPartyType: "customer" | "supplier";
  /** Label for the due-date field. */
  dueDateLabel: string;
  /** Label for the payment-terms field. */
  paymentTermsLabel: string;
  /** "Invoice No" / "Quotation No" / etc. */
  numberLabel: string;
  /** "Invoice Date" / "Quotation Date" / etc. */
  dateLabel: string;
  /** If true, the form surfaces Original Doc Number / Date inputs. */
  showsOriginalDoc: boolean;
  /** If true, surface a Bill-to / Ship-to address block and ship-to override
   *  picker. Today only `sales_invoice` uses this; other sales docs like
   *  quotation / delivery_challan can opt in later. */
  usesShipTo: boolean;
  /** If true, this is a money-in doc (sales-side); the payment panel records
   *  a `payment_in`. False for purchase-side docs (payment_out). */
  isSalesSide: boolean;
  /** Route to return to on save success. */
  detailRoute: (businessId: string, id: string) => string;
}

const TYPE_CONFIGS: Record<DocTypeValue, DocTypeUiConfig> = {
  sales_invoice: {
    title: "sales invoice",
    partyLabel: "Bill to",
    defaultPartyType: "customer",
    dueDateLabel: "Due Date",
    paymentTermsLabel: "Payment Terms",
    numberLabel: "Sales Invoice No",
    dateLabel: "Sales Invoice Date",
    showsOriginalDoc: false,
    usesShipTo: true,
    isSalesSide: true,
    detailRoute: (b, id) => routes.b(b).salesInvoice(id),
  },
  estimate: {
    title: "estimate",
    partyLabel: "Bill to",
    defaultPartyType: "customer",
    dueDateLabel: "Validity Date",
    paymentTermsLabel: "Valid for",
    numberLabel: "Estimate No",
    dateLabel: "Estimate Date",
    showsOriginalDoc: false,
    usesShipTo: false,
    isSalesSide: true,
    detailRoute: (b, id) => `/b/${b}/sales/estimates/${id}`,
  },
  delivery_challan: {
    title: "delivery challan",
    partyLabel: "Deliver to",
    defaultPartyType: "customer",
    dueDateLabel: "Delivery Date",
    paymentTermsLabel: "Delivery in",
    numberLabel: "Challan No",
    dateLabel: "Challan Date",
    showsOriginalDoc: false,
    usesShipTo: false,
    isSalesSide: true,
    detailRoute: (b, id) => `/b/${b}/sales/delivery-challans/${id}`,
  },
  credit_note: {
    title: "credit note",
    partyLabel: "Bill to (customer)",
    defaultPartyType: "customer",
    dueDateLabel: "Due Date",
    paymentTermsLabel: "Payment Terms",
    numberLabel: "Credit Note No",
    dateLabel: "Credit Note Date",
    showsOriginalDoc: false,
    usesShipTo: false,
    isSalesSide: true,
    detailRoute: (b, id) => routes.b(b).creditNote(id),
  },
  purchase_invoice: {
    title: "purchase invoice",
    partyLabel: "Bill from (supplier)",
    defaultPartyType: "supplier",
    dueDateLabel: "Due Date",
    paymentTermsLabel: "Payment Terms",
    numberLabel: "Purchase Invoice No",
    dateLabel: "Purchase Date",
    showsOriginalDoc: true,
    usesShipTo: false,
    isSalesSide: false,
    detailRoute: (b, id) => routes.b(b).purchaseInvoice(id),
  },
  debit_note: {
    title: "debit note",
    partyLabel: "Bill from (supplier)",
    defaultPartyType: "supplier",
    dueDateLabel: "Due Date",
    paymentTermsLabel: "Payment Terms",
    numberLabel: "Debit Note No",
    dateLabel: "Debit Note Date",
    showsOriginalDoc: true,
    usesShipTo: false,
    isSalesSide: false,
    detailRoute: (b, id) => routes.b(b).debitNote(id),
  },
  quotation: {
    title: "quotation",
    partyLabel: "Quote to",
    defaultPartyType: "customer",
    dueDateLabel: "Validity Date",
    paymentTermsLabel: "Valid for",
    numberLabel: "Quotation No",
    dateLabel: "Quotation Date",
    showsOriginalDoc: false,
    usesShipTo: false,
    isSalesSide: true,
    detailRoute: (b, id) => routes.b(b).quotation(id),
  },
  proforma_invoice: {
    title: "proforma invoice",
    partyLabel: "Bill to",
    defaultPartyType: "customer",
    dueDateLabel: "Due Date",
    paymentTermsLabel: "Payment Terms",
    numberLabel: "Proforma No",
    dateLabel: "Proforma Date",
    showsOriginalDoc: false,
    usesShipTo: false,
    isSalesSide: true,
    detailRoute: (b, id) => `/b/${b}/sales/proforma-invoices/${id}`,
  },
};

/* ------------------------------------------------------------------ */
/* Form state                                                          */
/* ------------------------------------------------------------------ */

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
  lines: [],
  shipToAddressId: null,
});

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type BusinessHeaderInfo = Pick<
  Business,
  | "name"
  | "bankAccountNumber"
  | "bankIfsc"
  | "upiId"
  | "signatureUrl"
  | "signatureMode"
>;

export function DocumentForm({
  businessId,
  businessStateCode,
  business,
  docType,
  parties,
  items,
  itemCategories,
  moneyAccounts,
  editingId,
  initial,
  defaultTermsConditions,
}: {
  businessId: string;
  businessStateCode: string | null;
  business: BusinessHeaderInfo;
  docType: DocTypeValue;
  parties: PickerParty[];
  items: Item[];
  itemCategories: ItemCategory[];
  moneyAccounts: MoneyAccount[];
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
  const [partyList, setPartyList] = useState<PickerParty[]>(parties);
  const [busy, setBusy] = useState(false);

  // Modals
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  // Per-doc removable sections (state only — doesn't change business config)
  const [showPaymentTerms, setShowPaymentTerms] = useState(true);
  const [showTerms, setShowTerms] = useState(
    Boolean(initial?.termsConditions ?? defaultTermsConditions),
  );
  const hasBank = Boolean(business.bankAccountNumber && business.bankIfsc);
  const hasUpi = Boolean(business.upiId);
  const [showBank, setShowBank] = useState(hasBank);
  const [showQr, setShowQr] = useState(hasUpi);

  // Inline payment capture (create-only; wiring lands next commit)
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentMode, setPaymentMode] =
    useState<(typeof PAYMENT_MODE_OPTIONS)[number]["value"]>("cash");
  const [autoRoundOff, setAutoRoundOff] = useState(true);

  /** Party billing + shipping addresses for the ship-to picker. */
  const [partyAddrs, setPartyAddrs] = useState<{
    billing: PartyAddress | null;
    shippingAddresses: PartyAddress[];
  } | null>(null);

  const selectedParty = useMemo(
    () => partyList.find((p) => p.id === f.partyId) ?? null,
    [partyList, f.partyId],
  );

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
        /* silent */
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

  function removeLine(idx: number) {
    setF((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx),
    }));
  }

  function appendPickedItems(picked: PickedItem[]) {
    const usePurchasePrice = !cfg.isSalesSide;
    const newLines: LineDraft[] = picked.map(({ item, quantity }) => ({
      itemId: item.id,
      itemName: item.name,
      hsn: item.hsnSacCode ?? "",
      unit: item.measuringUnitCode ?? "PCS",
      qty: quantity,
      price: usePurchasePrice
        ? item.purchasePrice ?? item.salesPrice ?? "0"
        : item.salesPrice ?? "0",
      gstRate: item.gstRate ?? "",
      discountPercent: "",
    }));
    setF((prev) => ({ ...prev, lines: [...prev.lines, ...newLines] }));
    setItemPickerOpen(false);
  }

  const totals = useMemo(() => {
    let subtotal = new Decimal(0);
    let totalDiscount = new Decimal(0);
    let taxable = new Decimal(0);
    let tax = new Decimal(0);
    let cgst = new Decimal(0);
    let sgst = new Decimal(0);
    let igst = new Decimal(0);
    let totalQty = new Decimal(0);
    const isInterstate =
      Boolean(businessStateCode) &&
      Boolean(f.placeOfSupplyStateCode) &&
      businessStateCode !== f.placeOfSupplyStateCode;

    for (const line of f.lines) {
      const qty = new Decimal(line.qty || "0");
      totalQty = totalQty.plus(qty);
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
    const grandTotal = autoRoundOff
      ? preRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      : preRound;
    const roundOff = grandTotal.minus(preRound);
    const received = new Decimal(amountReceived || "0");
    const balance = grandTotal.minus(received);
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
      balance: balance.toFixed(2),
      totalQty: totalQty.toFixed(2),
      isInterstate,
    };
  }, [
    f.lines,
    f.placeOfSupplyStateCode,
    businessStateCode,
    autoRoundOff,
    amountReceived,
  ]);

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
      paymentTermsDays: showPaymentTerms
        ? Number(f.paymentTermsDays) || null
        : null,
      dueDate: showPaymentTerms ? f.dueDate || null : null,
      placeOfSupplyStateCode: f.placeOfSupplyStateCode || null,
      originalDocNumber: f.originalDocNumber.trim() || null,
      originalDocDate: f.originalDocDate || null,
      termsConditions: showTerms ? f.termsConditions || null : null,
      notes: f.notes || null,
      ...(cfg.usesShipTo ? { shipToAddressId: f.shipToAddressId } : {}),
      lines,
    };
  }

  async function save(saveAndNew: boolean) {
    if (busy) return;
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
      // Auto-finalise so the doc gets a number — matches myBillBook's "Save"
      // which always produces a billable doc, not a perpetual draft.
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
      toast.success(`${cfg.title} ${fjson.data.docNumber} saved`);
      if (saveAndNew && !isEdit) {
        // Clear form, stay on page
        setF(
          blankInitial({
            docDate: new Date().toISOString().slice(0, 10),
            termsConditions: defaultTermsConditions,
          }),
        );
        setAmountReceived("");
        return;
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

  function markFullyPaid(checked: boolean) {
    if (checked) setAmountReceived(totals.grandTotal);
    else setAmountReceived("");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="-mx-4 -my-6 flex flex-col bg-muted/20 sm:-mx-6 sm:-my-8"
    >
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label="Back"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold capitalize">
            {isEdit ? `Edit ${cfg.title}` : `Create ${cfg.title}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => save(true)}
              disabled={busy}
            >
              Save &amp; New
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !f.partyId || f.lines.length === 0}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {/* Header section: Bill To card + meta cluster */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Bill To card */}
          <div className="lg:col-span-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              {cfg.partyLabel}
            </p>
            {selectedParty ? (
              <div className="flex items-center justify-between rounded-md border border-input bg-background px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedParty.name}
                  </p>
                  {selectedParty.mobileNumber && (
                    <p className="text-xs text-muted-foreground">
                      {selectedParty.mobileNumber}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPartyPickerOpen(true)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPartyPickerOpen(true)}
                className="flex min-h-22 w-full items-center justify-center rounded-md border-2 border-dashed border-primary/40 bg-background text-sm font-medium text-primary hover:bg-primary/5"
              >
                + Add Party
              </button>
            )}
          </div>

          {/* Meta cluster */}
          <div className="rounded-md border border-input bg-background p-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {cfg.numberLabel}
                </Label>
                <p className="text-sm font-medium text-muted-foreground/70">
                  Auto-assigned on save
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor="doc-date"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  {cfg.dateLabel}
                </Label>
                <Input
                  id="doc-date"
                  type="date"
                  value={f.docDate}
                  onChange={(e) => set("docDate", e.target.value)}
                  required
                  className="h-9"
                />
              </div>
            </div>
            {showPaymentTerms ? (
              <div className="relative mt-3 rounded-md border border-input bg-muted/20 p-3 pr-9">
                <button
                  type="button"
                  onClick={() => setShowPaymentTerms(false)}
                  className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Remove payment terms"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="terms-days"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {cfg.paymentTermsLabel}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="terms-days"
                        type="number"
                        min={0}
                        value={f.paymentTermsDays}
                        onChange={(e) =>
                          set("paymentTermsDays", e.target.value)
                        }
                        className="h-9"
                      />
                      <span className="text-xs text-muted-foreground">
                        days
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="due-date"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {cfg.dueDateLabel}
                    </Label>
                    <Input
                      id="due-date"
                      type="date"
                      value={f.dueDate}
                      onChange={(e) => set("dueDate", e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPaymentTerms(true)}
                className="mt-3 text-xs font-medium text-primary hover:underline"
              >
                + Add Payment Terms
              </button>
            )}
            {/* Place of supply — kept compact, India-GST critical */}
            <div className="mt-3 flex flex-col gap-1">
              <Label
                htmlFor="pos-state"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Place of Supply
              </Label>
              <select
                id="pos-state"
                value={f.placeOfSupplyStateCode}
                onChange={(e) =>
                  set("placeOfSupplyStateCode", e.target.value)
                }
                className={cn(
                  SELECT_CLASS,
                  "h-9",
                  !f.placeOfSupplyStateCode && "text-muted-foreground/60",
                )}
              >
                <option value="">— intrastate default —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            {cfg.showsOriginalDoc && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-input pt-3">
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="orig-no"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Supplier Inv No <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="orig-no"
                    value={f.originalDocNumber}
                    onChange={(e) =>
                      set("originalDocNumber", e.target.value)
                    }
                    placeholder="Required for ITC"
                    className="h-9"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="orig-date"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Supplier Inv Date
                  </Label>
                  <Input
                    id="orig-date"
                    type="date"
                    value={f.originalDocDate}
                    onChange={(e) => set("originalDocDate", e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ship-to card */}
        {cfg.usesShipTo && f.partyId && partyAddrs?.billing && (
          <div className="rounded-md border border-input bg-background p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bill to
                </h2>
                <address className="not-italic text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {formatAddressLine(partyAddrs.billing)}
                </address>
              </div>
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ship to
                </h2>
                {partyAddrs.shippingAddresses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Same as billing
                  </p>
                ) : (
                  <>
                    <select
                      value={f.shipToAddressId ?? ""}
                      onChange={(e) =>
                        set("shipToAddressId", e.target.value || null)
                      }
                      className={cn(SELECT_CLASS, "h-9")}
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
          </div>
        )}

        {/* Line items table */}
        <div className="overflow-hidden rounded-md border border-input bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left font-medium">NO</th>
                <th className="px-2 py-2 text-left font-medium">
                  Items / Services
                </th>
                <th className="px-2 py-2 text-left font-medium">HSN / SAC</th>
                <th className="px-2 py-2 text-right font-medium">Qty</th>
                <th className="px-2 py-2 text-right font-medium">
                  Price / Item (₹)
                </th>
                <th className="px-2 py-2 text-right font-medium">Discount</th>
                <th className="px-2 py-2 text-left font-medium">Tax</th>
                <th className="px-2 py-2 text-right font-medium">
                  Amount (₹)
                </th>
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
                  <tr
                    key={idx}
                    className="border-t border-border align-top"
                  >
                    <td className="px-2 py-2 text-center text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        className={COMPACT_INPUT}
                        value={line.itemName}
                        onChange={(e) =>
                          setLine(idx, { itemName: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        className={cn(COMPACT_INPUT, "font-mono text-xs")}
                        value={line.hsn}
                        onChange={(e) =>
                          setLine(idx, { hsn: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        className={cn(COMPACT_INPUT, "text-right tabular-nums")}
                        value={line.qty}
                        onChange={(e) =>
                          setLine(idx, { qty: e.target.value })
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        className={cn(COMPACT_INPUT, "text-right tabular-nums")}
                        value={line.price}
                        onChange={(e) =>
                          setLine(idx, { price: e.target.value })
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <Input
                          className={cn(
                            COMPACT_INPUT,
                            "text-right tabular-nums",
                          )}
                          value={line.discountPercent}
                          onChange={(e) =>
                            setLine(idx, {
                              discountPercent: e.target.value,
                            })
                          }
                          inputMode="decimal"
                          placeholder="0"
                        />
                        <span className="text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={cn(COMPACT_INPUT, "w-full")}
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
                    <td className="px-2 py-2 text-right tabular-nums font-medium">
                      ₹ {lineAmount}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        aria-label="Remove line"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {/* Add Item CTA row */}
              <tr className="border-t border-border">
                <td colSpan={9} className="p-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setItemPickerOpen(true)}
                      className="flex flex-1 items-center justify-center rounded-md border-2 border-dashed border-primary/40 bg-background py-3 text-sm font-medium text-primary hover:bg-primary/5"
                    >
                      + Add Item
                    </button>
                  </div>
                </td>
              </tr>
              {f.lines.length > 0 && (
                <tr className="border-t border-border bg-muted/30">
                  <td className="px-2 py-2" />
                  <td
                    colSpan={2}
                    className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Subtotal
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-medium tabular-nums">
                    {totals.totalQty}
                  </td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 text-right text-sm font-medium tabular-nums">
                    − ₹ {inr(totals.totalDiscount)}
                  </td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums">
                    ₹ {inr(totals.subtotal)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer 2-col */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* LEFT: Notes, T&C, Bank, QR, Signatory */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-md border border-input bg-background p-4">
              <Label
                htmlFor="notes"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Notes
              </Label>
              <Textarea
                id="notes"
                rows={2}
                value={f.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Visible to customer"
              />
            </div>

            {showTerms ? (
              <div className="relative rounded-md border border-input bg-background p-4 pr-9">
                <button
                  type="button"
                  onClick={() => setShowTerms(false)}
                  className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Remove terms and conditions"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="tc"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Terms and Conditions
                  </Label>
                  <Textarea
                    id="tc"
                    rows={3}
                    value={f.termsConditions}
                    onChange={(e) => set("termsConditions", e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="self-start text-sm font-medium text-primary hover:underline"
              >
                + Add Terms and Conditions
              </button>
            )}

            {showBank && hasBank && (
              <div className="rounded-md border border-input bg-background p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Bank Details</h3>
                  <button
                    type="button"
                    onClick={() => setShowBank(false)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove Bank Account
                  </button>
                </div>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Account Number:</dt>
                  <dd className="font-mono">{business.bankAccountNumber}</dd>
                  <dt className="text-muted-foreground">IFSC Code:</dt>
                  <dd className="font-mono">{business.bankIfsc}</dd>
                  <dt className="text-muted-foreground">Account Holder:</dt>
                  <dd>{business.name}</dd>
                </dl>
              </div>
            )}
            {!showBank && hasBank && (
              <button
                type="button"
                onClick={() => setShowBank(true)}
                className="self-start text-sm font-medium text-primary hover:underline"
              >
                + Add Bank Details
              </button>
            )}

            {showQr && hasUpi && (
              <div className="rounded-md border border-input bg-background p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Payment QR</h3>
                  <button
                    type="button"
                    onClick={() => setShowQr(false)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove QR Code
                  </button>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {business.upiId}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  QR is rendered on the invoice PDF; customers scan to pay.
                </p>
              </div>
            )}
            {!showQr && hasUpi && (
              <button
                type="button"
                onClick={() => setShowQr(true)}
                className="self-start text-sm font-medium text-primary hover:underline"
              >
                + Add Payment QR
              </button>
            )}

            {business.signatureMode !== "none" && (
              <div className="mt-2 rounded-md border border-input bg-background p-4 text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Authorized signatory for {business.name}
                </p>
                {business.signatureMode === "uploaded" &&
                  business.signatureUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={business.signatureUrl}
                      alt="Signature"
                      className="ml-auto mt-2 h-12 object-contain"
                    />
                  )}
                {business.signatureMode === "empty_box" && (
                  <div className="ml-auto mt-2 h-12 w-40 border-b border-input" />
                )}
              </div>
            )}
          </div>

          {/* RIGHT: totals + payment panel */}
          <div className="rounded-md border border-input bg-background p-4">
            <dl className="flex flex-col gap-2 text-sm">
              <TotalRow label="Taxable Amount" value={`₹ ${inr(totals.taxable)}`} />
              {totals.isInterstate ? (
                <TotalRow
                  label="IGST"
                  value={`₹ ${inr(totals.igst)}`}
                  muted
                />
              ) : (
                <>
                  <TotalRow
                    label="CGST"
                    value={`₹ ${inr(totals.cgst)}`}
                    muted
                  />
                  <TotalRow
                    label="SGST"
                    value={`₹ ${inr(totals.sgst)}`}
                    muted
                  />
                </>
              )}
              <TotalRow
                label="Discount"
                value={`− ₹ ${inr(totals.totalDiscount)}`}
                muted
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoRoundOff}
                    onChange={(e) => setAutoRoundOff(e.target.checked)}
                  />
                  Auto Round Off
                </label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  ₹ {inr(totals.roundOff)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
                <span>Total Amount</span>
                <span className="tabular-nums">₹ {inr(totals.grandTotal)}</span>
              </div>
            </dl>

            {/* Inline payment capture (create-only). Wiring to /api/payment-entries
                lands in the next commit; today this is local state only. */}
            {!isEdit && (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                <label className="flex items-center justify-end gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      amountReceived !== "" &&
                      new Decimal(amountReceived).equals(totals.grandTotal)
                    }
                    onChange={(e) => markFullyPaid(e.target.checked)}
                  />
                  Mark as fully paid
                </label>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="amount-received" className="text-sm">
                    Amount Received
                  </Label>
                  <div className="flex h-10 max-w-65 flex-1 items-stretch overflow-hidden rounded-md border border-input bg-background">
                    <span className="flex items-center pl-3 pr-1 text-sm text-muted-foreground">
                      ₹
                    </span>
                    <input
                      id="amount-received"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      className="min-w-0 flex-1 bg-transparent px-2 text-right text-sm tabular-nums focus:outline-none"
                    />
                    <select
                      value={paymentMode}
                      onChange={(e) =>
                        setPaymentMode(
                          e.target
                            .value as (typeof PAYMENT_MODE_OPTIONS)[number]["value"],
                        )
                      }
                      className="border-l border-input bg-muted/30 px-2 text-xs"
                      aria-label="Payment mode"
                    >
                      {PAYMENT_MODE_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Balance Amount</span>
                  <span
                    className={cn(
                      "tabular-nums font-semibold",
                      new Decimal(totals.balance).isZero()
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                    )}
                  >
                    ₹ {inr(totals.balance)}
                  </span>
                </div>
                {amountReceived !== "" &&
                  moneyAccounts.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No cash / bank account configured — add one in Settings →
                      Payments before recording payment.
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Picker modals */}
      {partyPickerOpen && (
        <PartyPickerModal
          businessId={businessId}
          parties={partyList}
          defaultType={cfg.defaultPartyType}
          onSelect={(party) => {
            set("partyId", party.id);
            setPartyPickerOpen(false);
          }}
          onClose={() => setPartyPickerOpen(false)}
          onPartyCreated={(p) =>
            setPartyList((prev) => [{ ...p }, ...prev])
          }
        />
      )}
      {itemPickerOpen && (
        <ItemPickerModal
          businessId={businessId}
          items={items}
          categories={itemCategories}
          createItemUrl={`${routes.b(businessId).items}?create=1`}
          onSelect={appendPickedItems}
          onClose={() => setItemPickerOpen(false)}
        />
      )}
    </form>
  );
}

function TotalRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-sm", muted && "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* Re-export the legacy import path so we don't break anything. */
export { TYPE_CONFIGS };
