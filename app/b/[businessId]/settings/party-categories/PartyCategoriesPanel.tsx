"use client";
/**
 * Party categories settings panel — add + rename + soft-delete.
 *
 * Deletes are soft (`deleted_at`). Parties already tagged with the category
 * keep their `category_id`; the server-side render shows "—" for a
 * dangling reference (matches the item_categories pattern).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import type { PartyCategory } from "@/lib/db/schema";

export function PartyCategoriesPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: PartyCategory[];
}) {
  const [categories, setCategories] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/party-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name: name.trim() }),
      });
      const json = (await res.json()) as
        | { ok: true; data: PartyCategory }
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

  function startEdit(c: PartyCategory) {
    setEditingId(c.id);
    setEditingName(c.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(c: PartyCategory) {
    const newName = editingName.trim();
    if (!newName || newName === c.name) {
      cancelEdit();
      return;
    }
    try {
      const res = await fetch(`/api/party-categories/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const json = (await res.json()) as
        | { ok: true; data: PartyCategory }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setCategories((prev) =>
        prev
          .map((row) => (row.id === c.id ? json.data : row))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    }
  }

  async function remove(category: PartyCategory) {
    if (
      !window.confirm(
        `Delete category "${category.name}"? Parties already in this category will lose their tag.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/party-categories/${category.id}`, {
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
            placeholder="e.g. VIP · Wholesale · Retail"
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
          {categories.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 px-4 py-2.5"
              >
                {isEditing ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveEdit(c);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(c)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{c.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Rename"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
