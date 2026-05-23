"use client";
/**
 * Party custom field definitions panel — add + rename + delete.
 *
 * Mirrors the PartyCategoriesPanel shape. Definitions show up on every
 * party form as text inputs (V1 is text-only).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import type { PartyCustomFieldDefinition } from "@/lib/db/schema";

const MAX_FIELDS = 10;

export function PartyCustomFieldsPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: PartyCustomFieldDefinition[];
}) {
  const [defs, setDefs] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function add() {
    if (!name.trim()) return;
    if (defs.length >= MAX_FIELDS) {
      toast.error(`Max ${MAX_FIELDS} custom fields per workspace`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/party-custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name: name.trim() }),
      });
      const json = (await res.json()) as
        | { ok: true; data: PartyCustomFieldDefinition }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setDefs((prev) =>
        [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(d: PartyCustomFieldDefinition) {
    setEditingId(d.id);
    setEditingName(d.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(d: PartyCustomFieldDefinition) {
    const newName = editingName.trim();
    if (!newName || newName === d.name) {
      cancelEdit();
      return;
    }
    try {
      const res = await fetch(`/api/party-custom-fields/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const json = (await res.json()) as
        | { ok: true; data: PartyCustomFieldDefinition }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setDefs((prev) =>
        prev
          .map((row) => (row.id === d.id ? json.data : row))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    }
  }

  async function remove(d: PartyCustomFieldDefinition) {
    if (
      !window.confirm(
        `Delete field "${d.name}"? Existing values stay in the database but the field disappears from new party forms.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/party-custom-fields/${d.id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setDefs((prev) => prev.filter((r) => r.id !== d.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="cf-name" className="text-sm font-medium">
            Add a field
          </label>
          <Input
            id="cf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Birthday · Drug License No · Alt phone"
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
          disabled={busy || !name.trim() || defs.length >= MAX_FIELDS}
        >
          Add
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {defs.length} of {MAX_FIELDS} fields used.
      </p>

      {defs.length === 0 ? (
        <p className="rounded-md border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
          No custom fields yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-input">
          {defs.map((d) => {
            const isEditing = editingId === d.id;
            return (
              <li
                key={d.id}
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
                          saveEdit(d);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(d)}
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
                    <span className="text-sm">{d.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(d)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Rename"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(d)}
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
