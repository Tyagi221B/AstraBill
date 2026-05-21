"use client";
/**
 * Item create + edit form. Same component drives both flows.
 *
 * GST rate semantics on the chips:
 *   - "Exempt"  → null (legally exempted)
 *   - "0%"      → "0"  (nil-rated)
 *   - other     → that percent
 *
 * Opening stock is **only used at create**. On edit, the field is read-only
 * because editing it does NOT retroactively adjust on-hand stock (use the
 * Adjust Stock modal on the detail page instead). Service layer also
 * ignores openingStock on update — defensive.
 */
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ItemCategory, ItemUnit } from "@/lib/db/schema";
import { routes } from "@/lib/routes";

type ItemTypeOption = "product" | "service";

/** "Exempt" is `null`; numeric values are stored as strings. */
const GST_CHIPS: Array<{ label: string; value: string | null }> = [
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
  /** UI carries `null` (exempt) as empty string; the submit step maps back. */
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

export function ItemForm({
  businessId,
  units,
  initialCategories,
  editingItemId,
  initial,
}: {
  businessId: string;
  units: ItemUnit[];
  initialCategories: ItemCategory[];
  editingItemId?: string;
  initial?: ItemFormInitial;
}) {
  const isEdit = Boolean(editingItemId);
  const [f, setF] = useState<ItemFormInitial>(initial ?? blank);
  const [categories, setCategories] = useState<ItemCategory[]>(initialCategories);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const isProduct = f.type === "product";

  // Stable units list — services don't need a unit; products default to PCS.
  const unitOptions = useMemo(
    () =>
      units.map((u) => ({
        code: u.code,
        label: `${u.displayName} (${u.code})`,
      })),
    [units],
  );

  function set<K extends keyof ItemFormInitial>(
    key: K,
    value: ItemFormInitial[K],
  ) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function createCategory() {
    const name = newCategoryInput.trim();
    if (!name) return;
    setCategoryBusy(true);
    try {
      const res = await fetch("/api/item-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name }),
      });
      const json = (await res.json()) as
        | { ok: true; data: ItemCategory }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setCategories((prev) =>
        [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      set("categoryId", json.data.id);
      setNewCategoryInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setCategoryBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
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
          isProduct && f.alternativeUnitCode
            ? f.alternativeUnitCode
            : null,
        salesPrice: f.salesPrice.trim() || null,
        salesPriceIncludesTax: f.salesPriceIncludesTax,
        purchasePrice: f.purchasePrice.trim() || null,
        purchasePriceIncludesTax: f.purchasePriceIncludesTax,
        gstRate: f.gstRate, // null = exempt
        description: f.description.trim() || null,
      };
      if (isProduct) {
        // Opening stock is create-time only — see service-layer note.
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
        | { ok: true; data: { id: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      const targetId = isEdit ? editingItemId! : json.data.id;
      window.location.assign(routes.b(businessId).item(targetId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Basics</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label>
                Item type <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-3">
                {(["product", "service"] as const).map((t) => (
                  <label
                    key={t}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm capitalize transition-colors ${
                      f.type === t
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-input bg-background text-foreground hover:border-ring"
                    }`}
                  >
                    <input
                      type="radio"
                      name="type"
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                required
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={isProduct ? "Item name" : "Service name"}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">
                {isProduct ? "Item code" : "Service code"}
              </Label>
              <Input
                id="code"
                value={f.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder={isProduct ? "SKU / barcode" : "Optional"}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="category">Category</Label>
              <div className="flex gap-2">
                <select
                  id="category"
                  value={f.categoryId}
                  onChange={(e) => set("categoryId", e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— no category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  placeholder="New category…"
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={createCategory}
                  disabled={categoryBusy || !newCategoryInput.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">GST &amp; HSN/SAC</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="hsn">{isProduct ? "HSN code" : "SAC code"}</Label>
              <Input
                id="hsn"
                value={f.hsnSacCode}
                onChange={(e) => set("hsnSacCode", e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label>GST rate</Label>
              <div className="flex flex-wrap gap-2">
                {GST_CHIPS.map((chip) => {
                  const isActive = f.gstRate === chip.value;
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => set("gstRate", chip.value)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-input bg-background text-foreground hover:border-ring"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Exempt vs 0% are different under GST — exempt items don't
                count toward outward supplies the way nil-rated do.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Pricing</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sales">Sales price (₹)</Label>
              <Input
                id="sales"
                value={f.salesPrice}
                onChange={(e) => set("salesPrice", e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={f.salesPriceIncludesTax}
                  onChange={(e) =>
                    set("salesPriceIncludesTax", e.target.checked)
                  }
                />
                Price includes tax
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="purchase">Purchase price (₹)</Label>
              <Input
                id="purchase"
                value={f.purchasePrice}
                onChange={(e) => set("purchasePrice", e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={f.purchasePriceIncludesTax}
                  onChange={(e) =>
                    set("purchasePriceIncludesTax", e.target.checked)
                  }
                />
                Price includes tax
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {isProduct && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-base font-semibold">Stock</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="unit">Measuring unit</Label>
                <select
                  id="unit"
                  value={f.measuringUnitCode}
                  onChange={(e) => set("measuringUnitCode", e.target.value)}
                  className={SELECT_CLASS}
                >
                  {unitOptions.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="alt-unit">Alternative unit</Label>
                <select
                  id="alt-unit"
                  value={f.alternativeUnitCode}
                  onChange={(e) => set("alternativeUnitCode", e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— none —</option>
                  {unitOptions.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              {!isEdit && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="opening-stock">Opening stock</Label>
                    <Input
                      id="opening-stock"
                      value={f.openingStock}
                      onChange={(e) => set("openingStock", e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="opening-date">As of date</Label>
                    <Input
                      id="opening-date"
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
                <div className="md:col-span-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Opening stock is set at create. To change on-hand stock, use
                  Adjust Stock on the item detail page — the change is recorded
                  as a stock movement.
                </div>
              )}
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.enableLowStockWarning}
                    onChange={(e) =>
                      set("enableLowStockWarning", e.target.checked)
                    }
                  />
                  Warn when stock falls below threshold
                </label>
                {f.enableLowStockWarning && (
                  <Input
                    value={f.lowStockThreshold}
                    onChange={(e) => set("lowStockThreshold", e.target.value)}
                    placeholder="Threshold qty (e.g. 5)"
                    inputMode="decimal"
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              rows={3}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
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
          variant="primary"
          size="lg"
          disabled={busy || !f.name.trim()}
        >
          {busy
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save changes"
              : "Create item"}
        </Button>
      </div>
    </form>
  );
}
