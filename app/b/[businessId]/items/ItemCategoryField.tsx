"use client";
/**
 * Item category picker — combobox + inline-create modal.
 *
 * Mirrors PartyCategoryField. Trigger button opens a popover with existing
 * categories + a "+ Create category" CTA that opens a centered modal. POSTs
 * to /api/item-categories; the new row is appended via onCategoryCreated
 * and auto-selected via onChange.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ItemCategory } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const CATEGORY_NAME_MAX = 80;

export function ItemCategoryField({
  businessId,
  value,
  onChange,
  categories,
  onCategoryCreated,
}: {
  businessId: string;
  /** Selected categoryId, "" = none. */
  value: string;
  onChange: (id: string) => void;
  /** Current category list — lifted into the parent form so it survives
   *  the create flow. */
  categories: ItemCategory[];
  /** Called after a successful create — parent appends to its state. The
   *  new category is auto-selected via onChange. */
  onCategoryCreated: (category: ItemCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = categories.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openCreateModal() {
    setOpen(false);
    setCreating(true);
  }

  function handleCreated(c: ItemCategory) {
    onCategoryCreated(c);
    onChange(c.id);
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="item-category-trigger">Category</Label>
      <div ref={wrapperRef} className="relative">
        <button
          id="item-category-trigger"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-colors",
            "hover:border-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          )}
        >
          <span
            className={cn("truncate", !selected && "text-muted-foreground/50")}
          >
            {selected ? selected.name : "Search Categories"}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-input bg-background shadow-lg">
            {categories.length > 0 ? (
              <ul
                role="listbox"
                className="max-h-56 overflow-auto py-1"
                aria-label="Categories"
              >
                {categories.map((c) => (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={c.id === value}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "cursor-pointer px-3 py-2 text-sm hover:bg-muted",
                      c.id === value && "bg-muted/60 font-medium",
                    )}
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No categories yet
              </p>
            )}
            <div className="border-t border-input p-2">
              <button
                type="button"
                onClick={openCreateModal}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-primary/60 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
              >
                + Create category
              </button>
            </div>
          </div>
        )}
      </div>

      {creating && (
        <CreateCategoryModal
          businessId={businessId}
          onCreated={handleCreated}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CreateCategoryModal({
  businessId,
  onCreated,
  onClose,
}: {
  businessId: string;
  onCreated: (category: ItemCategory) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/item-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name: trimmed }),
      });
      const json = (await res.json()) as
        | { ok: true; data: ItemCategory }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(`Added “${json.data.name}”`);
      onCreated(json.data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create category",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-item-category-title"
    >
      <div
        className="w-full max-w-md rounded-lg bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="create-item-category-title"
            className="text-base font-semibold"
          >
            Create new category
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-item-category-name">Category name</Label>
          <Input
            id="new-item-category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ex: Electronics"
            maxLength={CATEGORY_NAME_MAX}
            disabled={busy}
            autoFocus
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={submit}
            disabled={busy || !name.trim()}
          >
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
