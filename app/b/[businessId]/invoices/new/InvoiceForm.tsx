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
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import {
  classifyTax,
  computeInvoiceTotals,
  computeLineItem,
  type ExtraChargeInput,
} from "@/lib/gst";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

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

// Native <select> styled to match the Input primitive.
const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

// Cell-sized variants for use inside the line-items table. Phase 2E
// upsized these from h-8/text-xs to h-9/text-sm so contents (HSN codes,
// unit prices, GST %) don't truncate at typical cell widths. Cells now
// fit their content; the outer table only needs horizontal scroll on
// genuinely narrow viewports.
const CELL_INPUT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";
const CELL_SELECT_CLASS = CELL_INPUT_CLASS;

// ---- accordion section --------------------------------------------------
// FormSection — twist-down card for optional content (Ship-to, Extra charges,
// Transport, Notes). Default-closed if the field is empty, default-open if
// the user already entered something (so an edit view doesn't hide existing
// data behind a click). Header shows a one-line summary when collapsed so
// the user can see "this is set to X" without expanding.

function FormSection({
  title,
  subtitle,
  summary,
  defaultOpen,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Short one-line summary shown when collapsed (e.g. "5/3, Subhash Nagar"). */
  summary?: ReactNode;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold">{title}</span>
            {subtitle && (
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
          {!open && summary && (
            <div className="mt-0.5 truncate text-sm text-muted-foreground">
              {summary}
            </div>
          )}
        </div>
      </button>
      {open && (
        <CardContent className="border-t border-border pt-5">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

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

  // Show the dual-unit billing columns (2nd qty + 2nd unit). Only this
  // niche pair is gated behind a toggle — everything else (HSN, Discount,
  // GST, Amount) is shown by default since every invoice realistically
  // uses them. Default-on for an edit view when existing data has
  // dual-unit values, so opening an existing invoice doesn't hide its
  // data behind the toggle.
  const initialDualUnit =
    initial?.lineItems?.some(
      (l) =>
        (l.secondaryQuantity && l.secondaryQuantity.trim() !== "") ||
        !!l.secondaryUnit,
    ) ?? false;
  const [showDualUnit, setShowDualUnit] = useState(initialDualUnit);

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

  const effectivePlaceOfSupply =
    placeOfSupplyStateCode ||
    selectedCustomer?.stateCode ||
    business.stateCode ||
    null;

  const taxClass = classifyTax(business.stateCode, effectivePlaceOfSupply);

  // ---- live totals preview --------------------------------------------

  // Per-line computed amounts (exposed separately so the table's "Amount"
  // column can show the GST-inclusive total per line — the same value
  // that appears on the finalised invoice's PDF).
  const lineAmounts = useMemo(() => {
    try {
      return lineItems.map((line) =>
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
    } catch {
      return null;
    }
  }, [lineItems, taxClass, isDeliveryChallan]);

  const totals = useMemo(() => {
    if (!lineAmounts) return null;
    try {
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
  }, [lineItems, lineAmounts, extraCharges, taxClass, isDeliveryChallan]);

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
        toast.error(json.error.message, {
          description: json.error.details
            ? JSON.stringify(json.error.details, null, 2)
            : undefined,
        });
        return;
      }
      const id = isEdit ? editingInvoiceId! : json.data.id;
      window.location.assign(routes.b(businessId).invoice(id));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong",
      );
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

  const TotalRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-0.5 text-sm tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );

  /** Totals card — shared between the sticky desktop right rail and the
   *  inline mobile placement. Rendered as `<Card>` so it matches every
   *  other panel on the form. */
  const TotalsCard = () => (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-3 text-base font-semibold">Totals</h2>
        {totals ? (
          <>
            <TotalRow label="Subtotal" value={`₹ ${totals.subtotal}`} />
            {Number(totals.discountAmount) > 0 && (
              <TotalRow
                label="Discount"
                value={`− ₹ ${totals.discountAmount}`}
              />
            )}
            {Number(totals.extraChargesTaxable) > 0 && (
              <TotalRow
                label="Taxable charges"
                value={`₹ ${totals.extraChargesTaxable}`}
              />
            )}
            <TotalRow
              label="Taxable"
              value={`₹ ${totals.taxableAmount}`}
            />
            {!isDeliveryChallan && totals.klass === "intrastate" ? (
              <>
                <TotalRow label="CGST" value={`₹ ${totals.cgstAmount}`} />
                <TotalRow label="SGST" value={`₹ ${totals.sgstAmount}`} />
              </>
            ) : !isDeliveryChallan ? (
              <TotalRow label="IGST" value={`₹ ${totals.igstAmount}`} />
            ) : null}
            <TotalRow
              label="Round-off"
              value={`${totals.roundOff.startsWith("-") ? "−" : "+"} ₹ ${totals.roundOff.replace(/^-/, "")}`}
            />
            {Number(totals.extraChargesNonTaxable) > 0 && (
              <TotalRow
                label="Freight / non-taxable"
                value={`+ ₹ ${totals.extraChargesNonTaxable}`}
              />
            )}
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-bold tabular-nums">
              <span>Total</span>
              <span>₹ {totals.total}</span>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {isDeliveryChallan
                ? "Delivery challan — no GST"
                : totals.klass === "intrastate"
                  ? "Intrastate — CGST + SGST"
                  : "Interstate — IGST"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Fill in the line items to preview the total.
          </p>
        )}
      </CardContent>
    </Card>
  );

  // Accordion default-open flags — open if data is present so an edit view
  // doesn't hide existing fields behind a click.
  const shipToOpen = !!(shipToName || shipToAddress);
  const extraChargesOpen = extraCharges.length > 0;
  const transportOpen = !!(transportMode || vehicleNumber || ewayBillNumber);
  const notesOpen = !!notes;

  return (
    <form onSubmit={submit} className="flex flex-col">
      {/* ===== Sticky action bar (md+ sticky; inline on mobile because
                MobileNav already owns the top edge there) ===== */}
      <div className="-mx-6 mb-5 border-b border-border bg-background/95 px-6 py-3 backdrop-blur sm:-mx-10 sm:px-10 md:sticky md:top-0 md:z-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              {isEdit ? "Edit invoice" : "New invoice"}
            </h1>
            {!isEdit && (
              <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                Draft saved on create. GST is computed from your business state
                and the place of supply.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href={routes.b(businessId).invoices}
              className={buttonClasses("outline", "md")}
            >
              Cancel
            </a>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={submitDisabled}
              className="hidden md:inline-flex"
            >
              {busy
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create draft"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* ===== Top split: Bill To (left) + Invoice details (right) ===== */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 text-base font-semibold">Bill to</h2>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="customer">Customer</Label>
                  <select
                    id="customer"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={SELECT_CLASS}
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
                {selectedCustomer &&
                (selectedCustomer.gstin ||
                  selectedCustomer.addressLine1 ||
                  selectedCustomer.addressLine2 ||
                  selectedCustomer.city) ? (
                  <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">
                    {selectedCustomer.gstin && (
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        GSTIN ·{" "}
                        <span className="font-mono text-foreground">
                          {selectedCustomer.gstin}
                        </span>
                      </div>
                    )}
                    {(selectedCustomer.addressLine1 ||
                      selectedCustomer.addressLine2 ||
                      selectedCustomer.city ||
                      selectedCustomer.stateCode) && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[
                          selectedCustomer.addressLine1,
                          selectedCustomer.addressLine2,
                          selectedCustomer.city,
                          selectedCustomer.stateCode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 text-base font-semibold">Invoice details</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="biz">
                    Business
                    {isEdit && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · locked
                      </span>
                    )}
                  </Label>
                  <select
                    id="biz"
                    value={businessId}
                    onChange={(e) => {
                      setBusinessId(e.target.value);
                      setCustomerId("");
                    }}
                    disabled={isEdit || businesses.length === 1}
                    className={SELECT_CLASS}
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.stateCode ? ` (${b.stateCode})` : " (no state set)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="type">
                    Type
                    {isEdit && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · locked
                      </span>
                    )}
                  </Label>
                  <select
                    id="type"
                    value={type}
                    onChange={(e) =>
                      setType(e.target.value as InvoiceTypeValue)
                    }
                    disabled={isEdit}
                    className={SELECT_CLASS}
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pos">Place of supply</Label>
                  <select
                    id="pos"
                    value={placeOfSupplyStateCode}
                    onChange={(e) => setPlaceOfSupplyStateCode(e.target.value)}
                    className={SELECT_CLASS}
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="due">
                    Due date{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ===== Line items — full width ===== */}
        {/* 9 always-visible columns: Item / HSN / Qty / Unit / Price /
            Discount / GST / Amount + ✕. The dual-unit pair (2nd qty / 2nd
            unit) sits behind a "+ dual-unit billing" toggle — it's niche
            and visually expensive when off. */}
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Line items</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDualUnit((v) => !v)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {showDualUnit
                    ? "− dual-unit billing"
                    : "+ dual-unit billing"}
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                >
                  + Add line
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th
                      className="px-2.5 py-2.5 font-medium"
                      style={{ minWidth: "16rem" }}
                    >
                      Item
                    </th>
                    <th
                      className="px-2.5 py-2.5 font-medium"
                      style={{ minWidth: "7rem" }}
                    >
                      HSN
                    </th>
                    <th
                      className="px-2.5 py-2.5 text-right font-medium"
                      style={{ minWidth: "5rem" }}
                    >
                      Qty
                    </th>
                    <th
                      className="px-2.5 py-2.5 font-medium"
                      style={{ minWidth: "5.5rem" }}
                    >
                      Unit
                    </th>
                    {showDualUnit && (
                      <>
                        <th
                          className="px-2.5 py-2.5 text-right font-medium"
                          style={{ minWidth: "5rem" }}
                        >
                          2nd qty
                        </th>
                        <th
                          className="px-2.5 py-2.5 font-medium"
                          style={{ minWidth: "5.5rem" }}
                        >
                          2nd unit
                        </th>
                      </>
                    )}
                    <th
                      className="px-2.5 py-2.5 text-right font-medium"
                      style={{ minWidth: "6rem" }}
                    >
                      Price
                    </th>
                    <th
                      className="px-2.5 py-2.5 text-right font-medium"
                      style={{ minWidth: "5.5rem" }}
                    >
                      Discount
                    </th>
                    {!isDeliveryChallan && (
                      <th
                        className="px-2.5 py-2.5 text-right font-medium"
                        style={{ minWidth: "4.5rem" }}
                      >
                        GST %
                      </th>
                    )}
                    <th
                      className="px-2.5 py-2.5 text-right font-medium"
                      style={{ minWidth: "7rem" }}
                    >
                      Amount
                    </th>
                    <th className="w-12 px-2.5 py-2.5" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, i) => (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="px-2.5 py-3">
                        <div className="flex flex-col gap-2">
                          <select
                            value={line.productId ?? ""}
                            onChange={(e) =>
                              pickProductForLine(i, e.target.value)
                            }
                            className={CELL_SELECT_CLASS}
                          >
                            <option value="">— Custom / Free text —</option>
                            {businessProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) =>
                              updateLine(i, { description: e.target.value })
                            }
                            placeholder="Description (printed on the invoice)"
                            className={CELL_INPUT_CLASS}
                          />
                        </div>
                      </td>
                      <td className="px-2.5 py-3">
                        <input
                          type="text"
                          value={line.hsnCode}
                          onChange={(e) =>
                            updateLine(i, { hsnCode: e.target.value })
                          }
                          maxLength={20}
                          placeholder="—"
                          className={cn(CELL_INPUT_CLASS, "font-mono")}
                        />
                      </td>
                      <td className="px-2.5 py-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(i, { quantity: e.target.value })
                          }
                          className={cn(
                            CELL_INPUT_CLASS,
                            "text-right tabular-nums",
                          )}
                        />
                      </td>
                      <td className="px-2.5 py-3">
                        <select
                          value={line.unit}
                          onChange={(e) =>
                            updateLine(i, {
                              unit: e.target.value as UnitValue,
                            })
                          }
                          className={CELL_SELECT_CLASS}
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      {showDualUnit && (
                        <>
                          <td className="px-2.5 py-3">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.secondaryQuantity}
                              onChange={(e) =>
                                updateLine(i, {
                                  secondaryQuantity: e.target.value,
                                })
                              }
                              placeholder="—"
                              className={cn(
                                CELL_INPUT_CLASS,
                                "text-right tabular-nums",
                              )}
                            />
                          </td>
                          <td className="px-2.5 py-3">
                            <select
                              value={line.secondaryUnit}
                              onChange={(e) =>
                                updateLine(i, {
                                  secondaryUnit: e.target.value as
                                    | UnitValue
                                    | "",
                                })
                              }
                              className={CELL_SELECT_CLASS}
                            >
                              <option value="">—</option>
                              {UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </td>
                        </>
                      )}
                      <td className="px-2.5 py-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(i, { unitPrice: e.target.value })
                          }
                          className={cn(
                            CELL_INPUT_CLASS,
                            "text-right tabular-nums",
                          )}
                        />
                      </td>
                      <td className="px-2.5 py-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.discountAmount}
                          onChange={(e) =>
                            updateLine(i, { discountAmount: e.target.value })
                          }
                          placeholder="0"
                          className={cn(
                            CELL_INPUT_CLASS,
                            "text-right tabular-nums",
                          )}
                        />
                      </td>
                      {!isDeliveryChallan && (
                        <td className="px-2.5 py-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.gstRate}
                            onChange={(e) =>
                              updateLine(i, { gstRate: e.target.value })
                            }
                            className={cn(
                              CELL_INPUT_CLASS,
                              "text-right tabular-nums",
                            )}
                          />
                        </td>
                      )}
                      <td className="px-2.5 py-3 text-right">
                        <div className="flex h-9 items-center justify-end text-sm font-medium tabular-nums text-foreground">
                          {lineAmounts?.[i]
                            ? `₹ ${lineAmounts[i]!.amount}`
                            : "—"}
                        </div>
                      </td>
                      <td className="px-2.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          disabled={lineItems.length === 1}
                          title={
                            lineItems.length === 1
                              ? "An invoice needs at least one line"
                              : "Remove this line"
                          }
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-sm transition-colors",
                            lineItems.length === 1
                              ? "cursor-not-allowed text-muted-foreground/50"
                              : "text-destructive hover:bg-destructive/10",
                          )}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ===== Bottom 2-col: accordions (left) + Totals (right) ===== */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <FormSection
              title="Ship-to"
              subtitle="optional"
              summary={
                shipToName || shipToAddress
                  ? `${shipToName}${shipToName && shipToAddress ? " · " : ""}${shipToAddress}`
                  : "Ships to the bill-to customer by default"
              }
              defaultOpen={shipToOpen}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr]">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="shipName">Consignee name</Label>
                  <Input
                    id="shipName"
                    value={shipToName}
                    onChange={(e) => setShipToName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="shipAddr">Ship-to address</Label>
                  <Input
                    id="shipAddr"
                    value={shipToAddress}
                    onChange={(e) => setShipToAddress(e.target.value)}
                  />
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Extra charges"
              subtitle="cutting / labour / freight"
              summary={
                extraCharges.length > 0
                  ? `${extraCharges.length} charge${extraCharges.length > 1 ? "s" : ""}`
                  : "None added"
              }
              defaultOpen={extraChargesOpen}
            >
              <div className="mb-3 flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCharge}
                >
                  + Add charge
                </Button>
              </div>
              {extraCharges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add taxable charges (cutting, processing) to fold into the
                  taxable base, or non-taxable charges (informal freight) that
                  ride on top of the rounded total.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-1.5 py-1.5 font-medium">Label</th>
                        <th className="px-1.5 py-1.5 font-medium">Amount</th>
                        <th className="px-1.5 py-1.5 font-medium">Taxable</th>
                        <th className="px-1.5 py-1.5 font-medium">GST %</th>
                        <th className="px-1.5 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {extraCharges.map((c, i) => (
                        <tr
                          key={i}
                          className="border-t border-border align-top"
                        >
                          <td className="px-1 py-1.5">
                            <input
                              type="text"
                              value={c.label}
                              onChange={(e) =>
                                updateCharge(i, { label: e.target.value })
                              }
                              placeholder="e.g. Cutting charge"
                              className={CELL_INPUT_CLASS}
                            />
                          </td>
                          <td className="w-32.5 px-1 py-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={c.amount}
                              onChange={(e) =>
                                updateCharge(i, { amount: e.target.value })
                              }
                              className={cn(
                                CELL_INPUT_CLASS,
                                "text-right tabular-nums",
                              )}
                            />
                          </td>
                          <td className="w-27.5 px-1 py-1.5">
                            <label className="flex items-center gap-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={c.taxable}
                                onChange={(e) =>
                                  updateCharge(i, {
                                    taxable: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-input"
                              />
                              Taxable
                            </label>
                          </td>
                          <td className="w-25 px-1 py-1.5">
                            {c.taxable ? (
                              <input
                                type="text"
                                inputMode="decimal"
                                value={c.gstRate}
                                onChange={(e) =>
                                  updateCharge(i, { gstRate: e.target.value })
                                }
                                className={cn(
                                  CELL_INPUT_CLASS,
                                  "text-right tabular-nums",
                                )}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground/70">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeCharge(i)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-sm text-destructive transition-colors hover:bg-destructive/10"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </FormSection>

            <FormSection
              title="Transport & e-way bill"
              subtitle="optional"
              summary={
                transportMode || vehicleNumber || ewayBillNumber
                  ? [transportMode, vehicleNumber, ewayBillNumber]
                      .filter(Boolean)
                      .join(" · ")
                  : "Not set"
              }
              defaultOpen={transportOpen}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tmode">Transport mode</Label>
                  <Input
                    id="tmode"
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value)}
                    placeholder="Road / Rail / Self pickup"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="veh">Vehicle number</Label>
                  <Input
                    id="veh"
                    value={vehicleNumber}
                    onChange={(e) =>
                      setVehicleNumber(e.target.value.toUpperCase())
                    }
                    placeholder="UP 32 AB 1234"
                    className="uppercase"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="eway">E-way bill number</Label>
                  <Input
                    id="eway"
                    value={ewayBillNumber}
                    onChange={(e) => setEwayBillNumber(e.target.value)}
                    placeholder="generated outside AstraBill"
                  />
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Notes"
              subtitle="optional"
              summary={
                notes
                  ? notes.length > 70
                    ? `${notes.slice(0, 70).trim()}…`
                    : notes
                  : "No notes"
              }
              defaultOpen={notesOpen}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Notes for the customer</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Anything the customer should see on the invoice."
                  className="min-h-28"
                />
              </div>
            </FormSection>
          </div>
          {/* Totals — inline (not sticky), matches myBillBook bottom-right */}
          <div>
            <TotalsCard />
          </div>
        </div>
      </div>

      {/* ===== Sticky bottom action bar — MOBILE ONLY ===== */}
      {/* On desktop the sticky top bar carries Save; on mobile the bottom bar
          puts Save at thumb reach. Negative margins break out of the
          BrandedAppShell's `px-6 sm:px-10` so the bar spans full width. */}
      <div className="sticky bottom-0 z-10 -mx-6 mt-5 border-t border-border bg-background/95 px-6 py-3 backdrop-blur sm:-mx-10 sm:px-10 md:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Total{" "}
            <span className="ml-1 text-base font-bold tabular-nums text-foreground">
              ₹ {totals?.total ?? "0.00"}
            </span>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={submitDisabled}
          >
            {busy
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save"
                : "Create"}
          </Button>
        </div>
      </div>
    </form>
  );
}
