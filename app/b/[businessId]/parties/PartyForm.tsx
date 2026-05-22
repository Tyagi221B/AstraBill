"use client";
/**
 * Party create + edit form. Same component drives both flows — pass
 * `editingPartyId` to switch into edit mode (POST → PATCH).
 *
 * Sections: General · GST/PAN · Credit · Contact · Billing address ·
 * Shipping address (same-as-billing toggle, default ON) · Notes. The
 * Billing/Shipping rows persist into `party_addresses` via the service;
 * leaving them blank skips the write entirely.
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

export type PartyTypeOption = "customer" | "supplier";

export interface AddressFormFields {
  streetAddress: string;
  city: string;
  /** Stored as the state code (e.g. "05" for Uttarakhand); display name is
   *  looked up from INDIAN_STATES at render time. */
  stateCode: string;
  pincode: string;
}

const blankAddress: AddressFormFields = {
  streetAddress: "",
  city: "",
  stateCode: "",
  pincode: "",
};

export interface PartyFormInitial {
  type: PartyTypeOption;
  name: string;
  mobileNumber: string;
  email: string;
  gstin: string;
  panNumber: string;
  creditPeriodDays: string;
  creditLimit: string;
  contactPersonName: string;
  contactPersonDob: string;
  notes: string;
  billing: AddressFormFields;
  /** When true → shippingAddress fields are ignored on submit. */
  shippingSameAsBilling: boolean;
  shipping: AddressFormFields;
}

const blank: PartyFormInitial = {
  type: "customer",
  name: "",
  mobileNumber: "",
  email: "",
  gstin: "",
  panNumber: "",
  creditPeriodDays: "30",
  creditLimit: "0",
  contactPersonName: "",
  contactPersonDob: "",
  notes: "",
  billing: { ...blankAddress },
  shippingSameAsBilling: true,
  shipping: { ...blankAddress },
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function lookupStateName(code: string): string | null {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? null;
}

function addressFieldsToPayload(addr: AddressFormFields): {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
} {
  const stateCode = addr.stateCode.trim() || null;
  return {
    streetAddress: addr.streetAddress.trim() || null,
    city: addr.city.trim() || null,
    state: stateCode ? lookupStateName(stateCode) : null,
    stateCode,
    pincode: addr.pincode.trim() || null,
  };
}

function addressIsEmpty(addr: AddressFormFields): boolean {
  return (
    !addr.streetAddress.trim() &&
    !addr.city.trim() &&
    !addr.stateCode.trim() &&
    !addr.pincode.trim()
  );
}

export function PartyForm({
  businessId,
  editingPartyId,
  initial,
}: {
  businessId: string;
  editingPartyId?: string;
  initial?: PartyFormInitial;
}) {
  const isEdit = Boolean(editingPartyId);
  const [f, setF] = useState<PartyFormInitial>(initial ?? blank);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PartyFormInitial>(
    key: K,
    value: PartyFormInitial[K],
  ) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function setBilling<K extends keyof AddressFormFields>(
    key: K,
    value: AddressFormFields[K],
  ) {
    setF((prev) => ({ ...prev, billing: { ...prev.billing, [key]: value } }));
  }

  function setShipping<K extends keyof AddressFormFields>(
    key: K,
    value: AddressFormFields[K],
  ) {
    setF((prev) => ({ ...prev, shipping: { ...prev.shipping, [key]: value } }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        type: f.type,
        name: f.name.trim(),
        mobileNumber: f.mobileNumber.trim() || null,
        email: f.email.trim() || null,
        gstin: f.gstin.trim() ? f.gstin.trim().toUpperCase() : null,
        panNumber: f.panNumber.trim()
          ? f.panNumber.trim().toUpperCase()
          : null,
        creditPeriodDays: Number(f.creditPeriodDays) || 0,
        creditLimit: f.creditLimit.trim() || "0",
        contactPersonName: f.contactPersonName.trim() || null,
        contactPersonDob: f.contactPersonDob.trim() || null,
        notes: f.notes.trim() || null,
      };

      // Address slice — only included when at least one billing field is
      // filled (avoids creating an empty `party_addresses` row). The
      // shipping policy always rides along so the service can soft-delete
      // a previously-saved shipping row when the user toggles back to
      // same-as-billing.
      if (!addressIsEmpty(f.billing)) {
        payload.billingAddress = addressFieldsToPayload(f.billing);
      }
      payload.shipping = f.shippingSameAsBilling
        ? { sameAsBilling: true }
        : {
            sameAsBilling: false,
            shippingAddress: addressFieldsToPayload(f.shipping),
          };
      const url = isEdit
        ? `/api/parties/${editingPartyId}`
        : "/api/parties";
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
      const targetId = isEdit ? editingPartyId! : json.data.id;
      window.location.assign(routes.b(businessId).party(targetId));
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
          <h2 className="mb-4 text-base font-semibold">General details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label>
                Party type <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-3">
                {(["customer", "supplier"] as const).map((t) => (
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
                placeholder="Enter name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mobile">Mobile number</Label>
              <Input
                id="mobile"
                value={f.mobileNumber}
                onChange={(e) => set("mobileNumber", e.target.value)}
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
          <h2 className="mb-4 text-base font-semibold">GST &amp; PAN</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                value={f.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                placeholder="29XXXXX9438X1XX"
                className="font-mono uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pan">PAN</Label>
              <Input
                id="pan"
                value={f.panNumber}
                onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                className="font-mono uppercase"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Credit terms</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="credit-period">Credit period (days)</Label>
              <Input
                id="credit-period"
                type="number"
                min={0}
                value={f.creditPeriodDays}
                onChange={(e) => set("creditPeriodDays", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="credit-limit">Credit limit (₹)</Label>
              <Input
                id="credit-limit"
                value={f.creditLimit}
                onChange={(e) => set("creditLimit", e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Billing address</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2 md:col-span-3">
              <Label htmlFor="billing-street">Street address</Label>
              <Textarea
                id="billing-street"
                rows={2}
                value={f.billing.streetAddress}
                onChange={(e) => setBilling("streetAddress", e.target.value)}
                placeholder="Shop no. / building / area"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="billing-city">City</Label>
              <Input
                id="billing-city"
                value={f.billing.city}
                onChange={(e) => setBilling("city", e.target.value)}
                placeholder="Roorkee"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="billing-state">State</Label>
              <select
                id="billing-state"
                value={f.billing.stateCode}
                onChange={(e) => setBilling("stateCode", e.target.value)}
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="billing-pin">Pincode</Label>
              <Input
                id="billing-pin"
                value={f.billing.pincode}
                onChange={(e) => setBilling("pincode", e.target.value)}
                placeholder="247667"
                inputMode="numeric"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Shipping address</h2>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={f.shippingSameAsBilling}
                onChange={(e) =>
                  set("shippingSameAsBilling", e.target.checked)
                }
              />
              Same as billing
            </label>
          </div>
          {f.shippingSameAsBilling ? (
            <p className="text-sm text-muted-foreground">
              The billing address above will be used for shipments. Uncheck
              to enter a different shipping address.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2 md:col-span-3">
                <Label htmlFor="ship-street">Street address</Label>
                <Textarea
                  id="ship-street"
                  rows={2}
                  value={f.shipping.streetAddress}
                  onChange={(e) =>
                    setShipping("streetAddress", e.target.value)
                  }
                  placeholder="Warehouse / branch / site"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ship-city">City</Label>
                <Input
                  id="ship-city"
                  value={f.shipping.city}
                  onChange={(e) => setShipping("city", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ship-state">State</Label>
                <select
                  id="ship-state"
                  value={f.shipping.stateCode}
                  onChange={(e) => setShipping("stateCode", e.target.value)}
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="ship-pin">Pincode</Label>
                <Input
                  id="ship-pin"
                  value={f.shipping.pincode}
                  onChange={(e) => setShipping("pincode", e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Contact person</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-name">Name</Label>
              <Input
                id="cp-name"
                value={f.contactPersonName}
                onChange={(e) => set("contactPersonName", e.target.value)}
                placeholder="Ankit Mishra"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-dob">Date of birth</Label>
              <Input
                id="cp-dob"
                type="date"
                value={f.contactPersonDob}
                onChange={(e) => set("contactPersonDob", e.target.value)}
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
              : "Create party"}
        </Button>
      </div>
    </form>
  );
}
