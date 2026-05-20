"use client";
/**
 * Customer create + edit form. The same component drives both flows — pass
 * `editingCustomerId` to switch into edit mode, which locks the business
 * selector and routes the submit to PATCH /api/customers/[id].
 */
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import { routes } from "@/lib/routes";

type BusinessOption = { id: string; name: string; stateCode: string | null };

export interface CustomerFormInitial {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateCode: string;
  pincode: string;
  notes: string;
}

const blank: CustomerFormInitial = {
  name: "",
  phone: "",
  email: "",
  gstin: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateCode: "",
  pincode: "",
  notes: "",
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function CustomerForm({
  businesses,
  initialBusinessId,
  editingCustomerId,
  initial,
}: {
  businesses: BusinessOption[];
  initialBusinessId: string;
  editingCustomerId?: string;
  initial?: CustomerFormInitial;
}) {
  const isEdit = Boolean(editingCustomerId);
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [f, setF] = useState<CustomerFormInitial>(initial ?? blank);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CustomerFormInitial>(
    key: K,
    value: CustomerFormInitial[K],
  ) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, string | null | undefined> = {
        name: f.name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        gstin: f.gstin.trim() ? f.gstin.trim().toUpperCase() : null,
        addressLine1: f.addressLine1.trim() || null,
        addressLine2: f.addressLine2.trim() || null,
        city: f.city.trim() || null,
        stateCode: f.stateCode || null,
        pincode: f.pincode.trim() || null,
        notes: f.notes.trim() || null,
      };
      const url = isEdit
        ? `/api/customers/${editingCustomerId}`
        : "/api/customers";
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
      window.location.assign(routes.b(businessId).customers);
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
              <Label htmlFor="phone">Phone (WhatsApp)</Label>
              <Input
                id="phone"
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="98765 43210"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">GST &amp; address</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                value={f.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                placeholder="15-char GSTIN (optional)"
                className="font-mono uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="state">State</Label>
              <select
                id="state"
                value={f.stateCode}
                onChange={(e) => set("stateCode", e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— select —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="addr1">Address line 1</Label>
              <Input
                id="addr1"
                value={f.addressLine1}
                onChange={(e) => set("addressLine1", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="addr2">Address line 2</Label>
              <Input
                id="addr2"
                value={f.addressLine2}
                onChange={(e) => set("addressLine2", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={f.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin">Pincode</Label>
              <Input
                id="pin"
                value={f.pincode}
                onChange={(e) => set("pincode", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (internal)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={f.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

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
              : "Create customer"}
        </Button>
      </div>
    </form>
  );
}
