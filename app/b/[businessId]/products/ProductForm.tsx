"use client";
/**
 * Product create + edit form. `editingProductId` switches into edit mode
 * (business + initial selection are locked; submit goes to PATCH).
 *
 * `canSeePurchasePrice` controls whether the purchase-price field is rendered
 * at all. Salesman / viewer roles never see this field — the server also
 * refuses to expose it (defense in depth).
 */
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { routes } from "@/lib/routes";

type BusinessOption = { id: string; name: string };

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

export interface ProductFormInitial {
  name: string;
  hsnCode: string;
  unit: (typeof UNITS)[number];
  gstRate: string;
  purchasePrice: string;
  sellingPrice: string;
  stock: string;
  lowStockThreshold: string;
  isActive: boolean;
}

const blank: ProductFormInitial = {
  name: "",
  hsnCode: "",
  unit: "pcs",
  gstRate: "18",
  purchasePrice: "",
  sellingPrice: "0.00",
  stock: "0",
  lowStockThreshold: "",
  isActive: true,
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function ProductForm({
  businesses,
  initialBusinessId,
  editingProductId,
  initial,
  canSeePurchasePrice,
}: {
  businesses: BusinessOption[];
  initialBusinessId: string;
  editingProductId?: string;
  initial?: ProductFormInitial;
  canSeePurchasePrice: boolean;
}) {
  const isEdit = Boolean(editingProductId);
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [f, setF] = useState<ProductFormInitial>(initial ?? blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductFormInitial>(
    key: K,
    value: ProductFormInitial[K],
  ) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: f.name.trim(),
        hsnCode: f.hsnCode.trim() || null,
        unit: f.unit,
        gstRate: f.gstRate,
        sellingPrice: f.sellingPrice,
        stock: f.stock,
        lowStockThreshold: f.lowStockThreshold.trim() || null,
        isActive: f.isActive,
      };
      if (canSeePurchasePrice) {
        payload.purchasePrice = f.purchasePrice.trim() || null;
      }
      const url = isEdit
        ? `/api/products/${editingProductId}`
        : "/api/products";
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
        setError(json.error.message);
        return;
      }
      window.location.assign(routes.b(businessId).products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Product</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="biz">
                Business
                {isEdit && (
                  <span className="font-normal text-muted-foreground">· locked</span>
                )}
              </Label>
              <select
                id="biz"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                disabled={isEdit || businesses.length === 1}
                className={SELECT_CLASS}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
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
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hsn">HSN code</Label>
              <Input
                id="hsn"
                value={f.hsnCode}
                onChange={(e) => set("hsnCode", e.target.value)}
                placeholder="e.g. 7003"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit">Unit</Label>
              <select
                id="unit"
                value={f.unit}
                onChange={(e) =>
                  set("unit", e.target.value as ProductFormInitial["unit"])
                }
                className={SELECT_CLASS}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Pricing &amp; stock</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="gstRate">GST rate %</Label>
              <Input
                id="gstRate"
                value={f.gstRate}
                onChange={(e) => set("gstRate", e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sell">
                Selling price <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sell"
                required
                value={f.sellingPrice}
                onChange={(e) => set("sellingPrice", e.target.value)}
                className="tabular-nums"
              />
            </div>
            {canSeePurchasePrice && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="buy">Purchase price</Label>
                <Input
                  id="buy"
                  value={f.purchasePrice}
                  onChange={(e) => set("purchasePrice", e.target.value)}
                  placeholder="optional"
                  className="tabular-nums"
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="stock">Stock on hand</Label>
              <Input
                id="stock"
                value={f.stock}
                onChange={(e) => set("stock", e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="low">Low-stock alert</Label>
              <Input
                id="low"
                value={f.lowStockThreshold}
                onChange={(e) => set("lowStockThreshold", e.target.value)}
                placeholder="optional"
                className="tabular-nums"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={f.isActive}
                  onChange={(e) => set("isActive", e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Active (selectable in invoices)
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end">
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
              : "Create product"}
        </Button>
      </div>
    </form>
  );
}
