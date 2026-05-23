"use client";
/**
 * Multi-shipping management panel — list + add + edit + delete + set
 * default. Lives on the party edit page; banks-panel sibling.
 *
 * Each row carries a required label ("Warehouse" / "Branch office" / …)
 * so the invoice picker can show meaningful options. INDIAN_STATES drives
 * state-name lookup from state code.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import type { PartyAddress } from "@/lib/db/schema";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

interface ShippingFormState {
  label: string;
  streetAddress: string;
  city: string;
  stateCode: string;
  pincode: string;
  isDefault: boolean;
}

const blankForm: ShippingFormState = {
  label: "",
  streetAddress: "",
  city: "",
  stateCode: "",
  pincode: "",
  isDefault: false,
};

function rowToForm(a: PartyAddress): ShippingFormState {
  return {
    label: a.label ?? "",
    streetAddress: a.streetAddress ?? "",
    city: a.city ?? "",
    stateCode: a.stateCode ?? "",
    pincode: a.pincode ?? "",
    isDefault: a.isDefault,
  };
}

function lookupStateName(code: string): string | null {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? null;
}

export function PartyShippingAddressesPanel({
  partyId,
  initial,
}: {
  partyId: string;
  initial: PartyAddress[];
}) {
  const [addresses, setAddresses] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShippingFormState>(blankForm);
  const [busy, setBusy] = useState(false);

  function startAdd() {
    setEditingId(null);
    setForm({ ...blankForm, isDefault: addresses.length === 0 });
    setAdding(true);
  }

  function startEdit(a: PartyAddress) {
    setAdding(false);
    setEditingId(a.id);
    setForm(rowToForm(a));
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setForm(blankForm);
  }

  async function refetch() {
    const res = await fetch(`/api/parties/${partyId}/shipping-addresses`);
    const json = (await res.json()) as
      | { ok: true; data: { addresses: PartyAddress[] } }
      | { ok: false; error: { message: string } };
    if (json.ok) setAddresses(json.data.addresses);
  }

  async function save() {
    if (!form.label.trim()) {
      toast.error("Label is required (e.g. Warehouse)");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        label: form.label.trim(),
        streetAddress: form.streetAddress.trim() || null,
        city: form.city.trim() || null,
        state: form.stateCode ? lookupStateName(form.stateCode) : null,
        stateCode: form.stateCode || null,
        pincode: form.pincode.trim() || null,
        isDefault: form.isDefault,
      };

      const url = editingId
        ? `/api/parties/${partyId}/shipping-addresses/${editingId}`
        : `/api/parties/${partyId}/shipping-addresses`;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as
        | { ok: true; data: PartyAddress }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      await refetch();
      cancel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: PartyAddress) {
    if (!window.confirm(`Delete shipping address "${a.label ?? "(no label)"}"?`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/parties/${partyId}/shipping-addresses/${a.id}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setAddresses((prev) => prev.filter((row) => row.id !== a.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function setDefault(a: PartyAddress) {
    try {
      const res = await fetch(
        `/api/parties/${partyId}/shipping-addresses/${a.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true }),
        },
      );
      const json = (await res.json()) as
        | { ok: true; data: PartyAddress }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  const isEditing = adding || editingId !== null;

  return (
    <div className="flex flex-col gap-4">
      {addresses.length === 0 && !isEditing ? (
        <p className="rounded-md border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
          No shipping addresses on file. Add one below to override the
          billing address on invoices.
        </p>
      ) : null}

      {addresses.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-input">
          {addresses.map((a) => {
            const cityPin = [a.city, a.pincode].filter(Boolean).join(" ");
            const stateLine = a.state
              ? a.stateCode
                ? `${a.state} (${a.stateCode})`
                : a.state
              : null;
            const lines = [a.streetAddress, cityPin || null, stateLine]
              .filter(Boolean) as string[];
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {a.label ?? "(no label)"}
                    </span>
                    {a.isDefault && <Badge tone="info">Default</Badge>}
                  </div>
                  {lines.length === 0 ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      No address fields filled
                    </p>
                  ) : (
                    <address className="mt-0.5 not-italic text-xs leading-relaxed text-muted-foreground">
                      {lines.map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </address>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!a.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefault(a)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Set as default"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isEditing ? (
        <div className="rounded-md border border-input p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {editingId ? "Edit shipping address" : "Add shipping address"}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1.5 md:col-span-3">
              <Label htmlFor="ship-label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ship-label"
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="Warehouse / Branch office / Project site"
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-3">
              <Label htmlFor="ship-street">Street address</Label>
              <Textarea
                id="ship-street"
                rows={2}
                value={form.streetAddress}
                onChange={(e) =>
                  setForm((f) => ({ ...f, streetAddress: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship-city">City</Label>
              <Input
                id="ship-city"
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship-state">State</Label>
              <select
                id="ship-state"
                value={form.stateCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, stateCode: e.target.value }))
                }
                className={SELECT_CLASS}
              >
                <option value="">— select state —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ship-pincode">Pincode</Label>
              <Input
                id="ship-pincode"
                value={form.pincode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pincode: e.target.value }))
                }
                inputMode="numeric"
              />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-3">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isDefault: e.target.checked }))
                }
              />
              Default shipping address for this party
            </label>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancel}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={save}
              disabled={busy || !form.label.trim()}
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Add address"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startAdd}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add shipping address
          </Button>
        </div>
      )}
    </div>
  );
}
