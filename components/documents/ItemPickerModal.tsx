"use client";
/**
 * ItemPickerModal — multi-select item picker with quantity stepper and
 * keyboard navigation. Mirrors myBillBook's "Add Items to Bill" modal:
 *
 *   [search box]         [category ▾]      [Create New Item ↗]
 *   ────────────────────────────────────────────────────────────
 *   Item Name   Item Code   Stock   Sales Price   Purchase Price   Quantity
 *   Glass Hdl   —           130 PCS  ₹400          ₹0               [ + Add ]      ← not added
 *   Bolt M8     B-08         50 PCS  ₹25           ₹15              [-] 2 [+] PCS  ← added
 *   …
 *   ────────────────────────────────────────────────────────────
 *   Keyboard: Change Qty [Enter]  Move [↑↓]
 *   Show N Item(s) Selected                    [Cancel ESC] [Add to Bill F7]
 *
 * Returns an array of { item, quantity } via onSelect when the user
 * confirms (F7 or Add to Bill button). Parent appends them as draft line
 * items. The "Create New Item" CTA opens /items?create=1 in a new tab so
 * the in-progress invoice draft is preserved.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import type { Item, ItemCategory } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface PickedItem {
  item: Item;
  quantity: string;
}

export function ItemPickerModal({
  items,
  categories,
  businessId,
  onSelect,
  onClose,
  /** Where the "Create New Item" link should open (new tab). */
  createItemUrl,
}: {
  items: Item[];
  categories: ItemCategory[];
  businessId: string;
  onSelect: (picked: PickedItem[]) => void;
  onClose: () => void;
  createItemUrl: string;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  /** Map of itemId → quantity string. Presence in the map = selected. */
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  /** Row index that owns keyboard focus. */
  const [focusedIdx, setFocusedIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryId && it.categoryId !== categoryId) return false;
      if (!q) return true;
      const name = it.name.toLowerCase();
      const code = (it.code ?? "").toLowerCase();
      const hsn = (it.hsnSacCode ?? "").toLowerCase();
      return name.includes(q) || code.includes(q) || hsn.includes(q);
    });
  }, [items, query, categoryId]);

  // Clamp focused index when filtered list shrinks.
  useEffect(() => {
    if (focusedIdx >= filtered.length) {
      setFocusedIdx(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, focusedIdx]);

  // Autofocus the search input on mount.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Scroll the focused row into view when it changes.
  useEffect(() => {
    rowRefs.current[focusedIdx]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [focusedIdx]);

  const selectedCount = selected.size;

  function toggleSelect(item: Item) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, "1");
      return next;
    });
  }

  function setQty(itemId: string, qty: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.set(itemId, qty);
      return next;
    });
  }

  function bumpQty(itemId: string, delta: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      const current = Number(next.get(itemId) ?? "0");
      const after = Math.max(0, current + delta);
      if (after === 0) next.delete(itemId);
      else next.set(itemId, String(after));
      return next;
    });
  }

  function confirm() {
    const picked: PickedItem[] = [];
    for (const item of items) {
      const qty = selected.get(item.id);
      if (qty && Number(qty) > 0) picked.push({ item, quantity: qty });
    }
    if (picked.length === 0) return;
    onSelect(picked);
  }

  // Global keyboard shortcuts: ESC / F7. Arrow + Enter are scoped to the
  // search field so typing in inputs doesn't hijack them.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "F7") {
        e.preventDefault();
        confirm();
        return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selected]);

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && filtered[focusedIdx]) {
      e.preventDefault();
      toggleSelect(filtered[focusedIdx]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-picker-title"
    >
      <div
        className="flex max-h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="item-picker-title" className="text-base font-semibold">
            Add Items to Bill
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search by Item / Serial no. / HSN code / SKU / Category"
                className="pl-9"
              />
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-10 min-w-44 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <a
              href={createItemUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create New Item
            </a>
          </div>
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Item Name</th>
                <th className="px-4 py-2 font-medium">Item Code</th>
                <th className="px-4 py-2 text-right font-medium">Stock</th>
                <th className="px-4 py-2 text-right font-medium">
                  Sales Price
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  Purchase Price
                </th>
                <th className="px-4 py-2 text-center font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {items.length === 0
                      ? "No items yet — create one above."
                      : `No items match “${query}”.`}
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => {
                  const qty = selected.get(item.id);
                  const isPicked = qty !== undefined;
                  const isFocused = idx === focusedIdx;
                  return (
                    <tr
                      key={item.id}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      className={cn(
                        "border-t border-border",
                        isFocused && "bg-muted/40",
                        isPicked && "bg-primary/5",
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {item.name}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {item.code ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {item.type === "service"
                          ? "—"
                          : `— ${item.measuringUnitCode ?? ""}`}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {item.salesPrice ? `₹ ${item.salesPrice}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {item.purchasePrice ? `₹ ${item.purchasePrice}` : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {isPicked ? (
                          <QtyStepper
                            qty={qty}
                            unit={item.measuringUnitCode ?? ""}
                            onChange={(v) => setQty(item.id, v)}
                            onInc={() => bumpQty(item.id, 1)}
                            onDec={() => bumpQty(item.id, -1)}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleSelect(item)}
                            className="mx-auto block rounded-md border border-dashed border-primary/60 px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/5"
                          >
                            + Add
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Shortcuts hint */}
        <div className="border-t border-border bg-muted/20 px-5 py-2 text-xs text-muted-foreground">
          <span className="mr-4">
            Keyboard:{" "}
            <kbd className="rounded border border-input bg-background px-1.5 py-0.5 font-mono text-[11px]">
              ↑↓
            </kbd>{" "}
            move ·{" "}
            <kbd className="rounded border border-input bg-background px-1.5 py-0.5 font-mono text-[11px]">
              Enter
            </kbd>{" "}
            select ·{" "}
            <kbd className="rounded border border-input bg-background px-1.5 py-0.5 font-mono text-[11px]">
              F7
            </kbd>{" "}
            add to bill ·{" "}
            <kbd className="rounded border border-input bg-background px-1.5 py-0.5 font-mono text-[11px]">
              ESC
            </kbd>{" "}
            cancel
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-background px-5 py-3">
          <span className="text-sm text-muted-foreground">
            Show{" "}
            <span className="font-medium text-foreground">{selectedCount}</span>{" "}
            Item{selectedCount === 1 ? "" : "s"} Selected
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel <span className="ml-1 text-xs opacity-60">[ESC]</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={confirm}
              disabled={selectedCount === 0}
            >
              Add to Bill <span className="ml-1 text-xs opacity-60">[F7]</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QtyStepper({
  qty,
  unit,
  onChange,
  onInc,
  onDec,
}: {
  qty: string;
  unit: string;
  onChange: (v: string) => void;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <div className="mx-auto flex h-9 max-w-[160px] items-stretch overflow-hidden rounded-md border border-input bg-background">
      <button
        type="button"
        onClick={onDec}
        aria-label="Decrease"
        className="flex w-8 items-center justify-center text-foreground hover:bg-muted"
      >
        −
      </button>
      <input
        value={qty}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="min-w-0 flex-1 border-x border-input bg-transparent px-1 text-center text-sm tabular-nums focus:outline-none"
      />
      <button
        type="button"
        onClick={onInc}
        aria-label="Increase"
        className="flex w-8 items-center justify-center text-foreground hover:bg-muted"
      >
        +
      </button>
      {unit && (
        <span className="flex items-center bg-muted/30 px-2 text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}
