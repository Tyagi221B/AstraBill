"use client";
/**
 * Item create + edit modal — myBillBook-parity layout.
 *
 * Centered modal with left-rail tabs (Basic Details required, Advance Details
 * group: Stock / Pricing / Party Wise Prices / Custom Fields). One form,
 * one submit. Save & New clears and stays open for batch entry.
 *
 * Opening stock is **only used at create**. On edit the field is hidden
 * because editing it does NOT retroactively adjust on-hand stock — use the
 * Adjust Stock modal on the item detail page. Service layer also ignores
 * openingStock on update.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Receipt, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ItemCategory, ItemUnit } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

import { ItemCategoryField } from "./ItemCategoryField";

type ItemTypeOption = "product" | "service";
type Tab = "basic" | "stock" | "pricing" | "party-prices" | "custom-fields";

/** "Exempt" is `null`; numeric values are stored as strings. */
const GST_OPTIONS: Array<{ label: string; value: string | null }> = [
  { label: "None (Exempt)", value: null },
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

export interface ItemFormInitial {
  type: ItemTypeOption;
  name: string;
  categoryId: string;
  code: string;
  hsnSacCode: string;
  measuringUnitCode: string;
  alternativeUnitCode: string;
  salesPrice: string;
  salesPriceIncludesTax: boolean;
  purchasePrice: string;
  purchasePriceIncludesTax: boolean;
  /** UI carries `null` (exempt) as itself; the submit step passes through. */
  gstRate: string | null;
  openingStock: string;
  openingStockAsOfDate: string;
  enableLowStockWarning: boolean;
  lowStockThreshold: string;
  description: string;
}

const blank: ItemFormInitial = {
  type: "product",
  name: "",
  categoryId: "",
  code: "",
  hsnSacCode: "",
  measuringUnitCode: "PCS",
  alternativeUnitCode: "",
  salesPrice: "",
  salesPriceIncludesTax: false,
  purchasePrice: "",
  purchasePriceIncludesTax: false,
  gstRate: "18",
  openingStock: "",
  openingStockAsOfDate: "",
  enableLowStockWarning: false,
  lowStockThreshold: "",
  description: "",
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function ItemFormModal({
  businessId,
  units,
  initialCategories,
  editingItemId,
  initial,
  onClose,
}: {
  businessId: string;
  units: ItemUnit[];
  initialCategories: ItemCategory[];
  editingItemId?: string;
  initial?: ItemFormInitial;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(editingItemId);
  const [f, setF] = useState<ItemFormInitial>(initial ?? blank);
  const [categories, setCategories] = useState<ItemCategory[]>(initialCategories);
  const [tab, setTab] = useState<Tab>("basic");
  const [busy, setBusy] = useState(false);
  const [showAltUnit, setShowAltUnit] = useState(
    Boolean((initial ?? blank).alternativeUnitCode),
  );
  const nameRef = useRef<HTMLInputElement>(null);

  const isProduct = f.type === "product";

  const unitOptions = useMemo(
    () =>
      units.map((u) => ({
        code: u.code,
        label: `${u.displayName} (${u.code})`,
      })),
    [units],
  );

  // Escape closes the modal (unless a request is in flight).
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Auto-focus the Name field on open (fast keyboard entry).
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function set<K extends keyof ItemFormInitial>(
    key: K,
    value: ItemFormInitial[K],
  ) {
    setF((p) => ({ ...p, [key]: value }));
  }

  function resetForm() {
    setF(blank);
    setTab("basic");
    setShowAltUnit(false);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  async function submit(saveAndNew: boolean) {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        type: f.type,
        name: f.name.trim(),
        categoryId: f.categoryId || null,
        code: f.code.trim() || null,
        hsnSacCode: f.hsnSacCode.trim() || null,
        measuringUnitCode: isProduct ? f.measuringUnitCode || null : null,
        alternativeUnitCode:
          isProduct && f.alternativeUnitCode ? f.alternativeUnitCode : null,
        salesPrice: f.salesPrice.trim() || null,
        salesPriceIncludesTax: f.salesPriceIncludesTax,
        purchasePrice: f.purchasePrice.trim() || null,
        purchasePriceIncludesTax: f.purchasePriceIncludesTax,
        gstRate: f.gstRate, // null = exempt
        description: f.description.trim() || null,
      };
      if (isProduct) {
        if (!isEdit) {
          payload.openingStock = f.openingStock.trim() || null;
          payload.openingStockAsOfDate = f.openingStockAsOfDate || null;
        }
        payload.enableLowStockWarning = f.enableLowStockWarning;
        payload.lowStockThreshold =
          f.enableLowStockWarning && f.lowStockThreshold.trim()
            ? f.lowStockThreshold.trim()
            : null;
      }
      const url = isEdit ? `/api/items/${editingItemId}` : "/api/items";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit ? payload : { ...payload, businessId };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as
        | { ok: true; data: { id: string; name?: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(
        isEdit ? "Item updated" : `Added “${json.data.name ?? f.name.trim()}”`,
      );
      if (saveAndNew && !isEdit) {
        resetForm();
        router.refresh();
      } else {
        router.refresh();
        onClose();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="item-modal-title" className="text-base font-semibold">
            {isEdit ? "Edit Item" : "Create New Item"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="flex min-h-0 flex-1 flex-col md:flex-row"
        >
          {/* Left rail */}
          <nav className="shrink-0 border-b border-border bg-muted/30 px-3 py-4 md:w-56 md:border-b-0 md:border-r md:py-5">
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-0">
              <TabButton
                active={tab === "basic"}
                onClick={() => setTab("basic")}
                required
              >
                Basic Details
              </TabButton>
            </ul>
            <p className="mt-5 hidden px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">
              Advance Details
            </p>
            <ul className="mt-2 flex gap-1 overflow-x-auto md:flex-col md:gap-0">
              <TabButton
                active={tab === "stock"}
                onClick={() => setTab("stock")}
              >
                Stock Details
              </TabButton>
              <TabButton
                active={tab === "pricing"}
                onClick={() => setTab("pricing")}
              >
                Pricing Details
              </TabButton>
              <TabButton
                active={tab === "party-prices"}
                onClick={() => setTab("party-prices")}
              >
                Party Wise Prices
              </TabButton>
              <TabButton
                active={tab === "custom-fields"}
                onClick={() => setTab("custom-fields")}
              >
                Custom Fields
              </TabButton>
            </ul>
          </nav>

          {/* Right panel */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {tab === "basic" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Item Type */}
                <div className="flex flex-col gap-2">
                  <Label>
                    Item Type <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-3">
                    {(["product", "service"] as const).map((t) => (
                      <label
                        key={t}
                        className={cn(
                          "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm capitalize transition-colors",
                          f.type === t
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-input bg-background text-foreground hover:border-ring",
                        )}
                      >
                        <input
                          type="radio"
                          name="item-type"
                          value={t}
                          checked={f.type === t}
                          onChange={() => set("type", t)}
                          className="sr-only"
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Category */}
                <ItemCategoryField
                  businessId={businessId}
                  value={f.categoryId}
                  onChange={(id) => set("categoryId", id)}
                  categories={categories}
                  onCategoryCreated={(c) =>
                    setCategories((prev) =>
                      [...prev, c].sort((a, b) =>
                        a.name.localeCompare(b.name),
                      ),
                    )
                  }
                />

                {/* Item Name — spans full width */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <Label htmlFor="item-name">
                    Item Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="item-name"
                    ref={nameRef}
                    required
                    value={f.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="ex: Maggi 20gm"
                  />
                </div>

                {/* Sales Price with tax pill */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-sales-price">Sales Price</Label>
                  <PriceWithTaxInput
                    id="item-sales-price"
                    value={f.salesPrice}
                    onChange={(v) => set("salesPrice", v)}
                    includesTax={f.salesPriceIncludesTax}
                    onIncludesTaxChange={(v) =>
                      set("salesPriceIncludesTax", v)
                    }
                    placeholder="ex: ₹200"
                  />
                </div>

                {/* GST Rate */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-gst-rate">GST Tax Rate (%)</Label>
                  <select
                    id="item-gst-rate"
                    value={f.gstRate ?? ""}
                    onChange={(e) =>
                      set(
                        "gstRate",
                        e.target.value === "" ? null : e.target.value,
                      )
                    }
                    className={SELECT_CLASS}
                  >
                    {GST_OPTIONS.map((o) => (
                      <option key={o.label} value={o.value ?? ""}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Measuring Unit */}
                {isProduct && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="item-unit">Measuring Unit</Label>
                    <select
                      id="item-unit"
                      value={f.measuringUnitCode}
                      onChange={(e) =>
                        set("measuringUnitCode", e.target.value)
                      }
                      className={SELECT_CLASS}
                    >
                      {unitOptions.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Opening Stock — only on create */}
                {isProduct && !isEdit && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="item-opening-stock">Opening Stock</Label>
                    <ValueWithUnitSuffix
                      id="item-opening-stock"
                      value={f.openingStock}
                      onChange={(v) => set("openingStock", v)}
                      suffix={f.measuringUnitCode}
                      placeholder="ex: 150"
                    />
                  </div>
                )}
              </div>
            )}

            {tab === "stock" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Item Code */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-code">Item Code</Label>
                  <Input
                    id="item-code"
                    value={f.code}
                    onChange={(e) => set("code", e.target.value)}
                    placeholder="ex: ITM12549"
                  />
                </div>

                {/* HSN/SAC code */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-hsn">
                    {isProduct ? "HSN code" : "SAC code"}
                  </Label>
                  <Input
                    id="item-hsn"
                    value={f.hsnSacCode}
                    onChange={(e) => set("hsnSacCode", e.target.value)}
                    placeholder="ex: 4010"
                    className="font-mono"
                  />
                </div>

                {isProduct && (
                  <>
                    {/* Measuring Unit */}
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="item-unit-stock">Measuring Unit</Label>
                      <select
                        id="item-unit-stock"
                        value={f.measuringUnitCode}
                        onChange={(e) =>
                          set("measuringUnitCode", e.target.value)
                        }
                        className={SELECT_CLASS}
                      >
                        {unitOptions.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                      {!showAltUnit && (
                        <button
                          type="button"
                          onClick={() => setShowAltUnit(true)}
                          className="self-start text-sm font-medium text-primary hover:underline"
                        >
                          + Alternative Unit
                        </button>
                      )}
                    </div>

                    {/* Alt unit (revealed) */}
                    {showAltUnit ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="item-alt-unit">
                          Alternative Unit
                        </Label>
                        <select
                          id="item-alt-unit"
                          value={f.alternativeUnitCode}
                          onChange={(e) =>
                            set("alternativeUnitCode", e.target.value)
                          }
                          className={cn(
                            SELECT_CLASS,
                            !f.alternativeUnitCode &&
                              "text-muted-foreground/50",
                          )}
                        >
                          <option value="">— none —</option>
                          {unitOptions
                            .filter((u) => u.code !== f.measuringUnitCode)
                            .map((u) => (
                              <option key={u.code} value={u.code}>
                                {u.label}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <div />
                    )}

                    {/* Opening Stock — only on create */}
                    {!isEdit && (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="item-opening-stock-2">
                            Opening Stock
                          </Label>
                          <ValueWithUnitSuffix
                            id="item-opening-stock-2"
                            value={f.openingStock}
                            onChange={(v) => set("openingStock", v)}
                            suffix={f.measuringUnitCode}
                            placeholder="ex: 150"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="item-opening-date">As of Date</Label>
                          <Input
                            id="item-opening-date"
                            type="date"
                            value={f.openingStockAsOfDate}
                            onChange={(e) =>
                              set("openingStockAsOfDate", e.target.value)
                            }
                          />
                        </div>
                      </>
                    )}

                    {isEdit && (
                      <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground md:col-span-2">
                        Opening stock is set at create. To change on-hand
                        stock, use Adjust Stock on the item detail page — the
                        change is recorded as a stock movement.
                      </div>
                    )}

                    {/* Low stock disclosure */}
                    <div className="md:col-span-2">
                      {f.enableLowStockWarning ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="item-low-stock">
                              Low stock threshold
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                set("enableLowStockWarning", false);
                                set("lowStockThreshold", "");
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Remove
                            </button>
                          </div>
                          <ValueWithUnitSuffix
                            id="item-low-stock"
                            value={f.lowStockThreshold}
                            onChange={(v) => set("lowStockThreshold", v)}
                            suffix={f.measuringUnitCode}
                            placeholder="ex: 5"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => set("enableLowStockWarning", true)}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          + Enable Low stock quantity warning
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Description */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <Label htmlFor="item-desc">Description</Label>
                  <Textarea
                    id="item-desc"
                    rows={3}
                    value={f.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Enter Description"
                  />
                </div>
              </div>
            )}

            {tab === "pricing" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-sales-price-2">Sales Price</Label>
                  <PriceWithTaxInput
                    id="item-sales-price-2"
                    value={f.salesPrice}
                    onChange={(v) => set("salesPrice", v)}
                    includesTax={f.salesPriceIncludesTax}
                    onIncludesTaxChange={(v) =>
                      set("salesPriceIncludesTax", v)
                    }
                    placeholder="ex: ₹200"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-purchase-price">Purchase Price</Label>
                  <PriceWithTaxInput
                    id="item-purchase-price"
                    value={f.purchasePrice}
                    onChange={(v) => set("purchasePrice", v)}
                    includesTax={f.purchasePriceIncludesTax}
                    onIncludesTaxChange={(v) =>
                      set("purchasePriceIncludesTax", v)
                    }
                    placeholder="ex: ₹150"
                  />
                </div>
                <p className="text-xs text-muted-foreground md:col-span-2">
                  Pricing on this tab and Basic Details share the same Sales
                  Price field — change either, both update.
                </p>
              </div>
            )}

            {tab === "party-prices" && (
              <SaveFirstEmptyState
                title="Party Wise Prices"
                body="To enable Party Wise Prices and set custom prices for parties, please save the item first."
              />
            )}

            {tab === "custom-fields" && (
              <SaveFirstEmptyState
                title="Custom Fields"
                body="To add custom fields like batch number or warranty, please save the item first."
              />
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            {!isEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void submit(true)}
                disabled={busy || !f.name.trim()}
              >
                Save &amp; New
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={() => void submit(false)}
              disabled={busy || !f.name.trim()}
            >
              {busy
                ? isEdit
                  ? "Saving…"
                  : "Adding…"
                : isEdit
                  ? "Save Changes"
                  : "Save Item"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  required,
  onClick,
  children,
}: {
  active: boolean;
  required?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap transition-colors",
          active
            ? "bg-primary/10 font-medium text-primary"
            : "text-foreground hover:bg-muted",
        )}
      >
        <span>{children}</span>
        {required && <span className="text-destructive">*</span>}
      </button>
    </li>
  );
}

function PriceWithTaxInput({
  id,
  value,
  onChange,
  includesTax,
  onIncludesTaxChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  includesTax: boolean;
  onIncludesTaxChange: (v: boolean) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex h-10 w-full items-stretch overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
      <span className="flex items-center pl-3 pr-1 text-sm text-muted-foreground">
        ₹
      </span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
      <select
        aria-label="Tax inclusion"
        value={includesTax ? "incl" : "excl"}
        onChange={(e) => onIncludesTaxChange(e.target.value === "incl")}
        className="border-l border-input bg-muted/30 px-2 text-xs text-foreground focus:outline-none"
      >
        <option value="excl">Without Tax</option>
        <option value="incl">With Tax</option>
      </select>
    </div>
  );
}

function ValueWithUnitSuffix({
  id,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  placeholder?: string;
}) {
  return (
    <div className="flex h-10 w-full items-stretch overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
      {suffix && (
        <span className="flex items-center border-l border-input bg-muted/30 px-3 text-xs font-medium text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

function SaveFirstEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-lg bg-muted/30 p-8 text-center">
      <Receipt className="mb-4 h-12 w-12 text-muted-foreground/60" />
      <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
