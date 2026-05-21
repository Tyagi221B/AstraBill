"use client";
/**
 * Item categories settings panel — add + soft-delete. Workspace-scoped.
 *
 * Deletes are soft (`deleted_at`). Items already tagged with the category
 * keep their `category_id`; the server-side render shows "—" for a dangling
 * reference. PR2 won't try to "clean up" tagged items — historical context
 * is preserved on purpose.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import type { ItemCategory } from "@/lib/db/schema";

export function ItemCategoriesPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: ItemCategory[];
}) {
  const [categories, setCategories] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/item-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name: name.trim() }),
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
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: ItemCategory) {
    if (
      !window.confirm(
        `Delete category "${category.name}"? Items already in this category will lose their tag.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/item-categories/${category.id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="cat-name" className="text-sm font-medium">
            Add a category
          </label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Glass · Hardware · Plywood"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={add}
          disabled={busy || !name.trim()}
        >
          Add
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="rounded-md border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
          No categories yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-input">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-sm">{c.name}</span>
              <button
                type="button"
                onClick={() => remove(c)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
