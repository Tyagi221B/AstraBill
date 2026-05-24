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
import type {
  PartyCategory,
  PartyCustomFieldDefinition,
} from "@/lib/db/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { PartyCategoryField } from "./PartyCategoryField";

export type PartyTypeOption = "customer" | "supplier";
export type OpeningBalanceDirection = "to_collect" | "to_pay";

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PartyFormInitial {
  type: PartyTypeOption;
  name: string;
  mobileNumber: string;
  email: string;
  gstin: string;
  panNumber: string;
  /** Empty string = no category (sent as null on submit). */
  categoryId: string;
  creditPeriodDays: string;
  creditLimit: string;
  contactPersonName: string;
  contactPersonDob: string;
  notes: string;
  billing: AddressFormFields;
  /** When true → shippingAddress fields are ignored on submit. */
  shippingSameAsBilling: boolean;
  shipping: AddressFormFields;
  /** Opening balance — "" or "0" means no posting. */
  openingBalanceAmount: string;
  openingBalanceDirection: OpeningBalanceDirection;
  /** As-of date for the opening_balance ledger row; defaults to today. */
  openingBalanceAsOfDate: string;
  /** Workspace custom-field values keyed by definitionId. Missing key =
   *  empty string. */
  customFieldValues: Record<string, string>;
}

const blank: PartyFormInitial = {
  type: "customer",
  name: "",
  mobileNumber: "",
  email: "",
  gstin: "",
  panNumber: "",
  categoryId: "",
  creditPeriodDays: "30",
  creditLimit: "0",
  contactPersonName: "",
  contactPersonDob: "",
  notes: "",
  billing: { ...blankAddress },
  shippingSameAsBilling: true,
  shipping: { ...blankAddress },
  openingBalanceAmount: "",
  openingBalanceDirection: "to_collect",
  openingBalanceAsOfDate: todayIso(),
  customFieldValues: {},
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function lookupStateName(code: string): string | null {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? null;
}

const GSTIN_FORMAT_RE = /^[0-9A-Z]{15}$/;

function isGstinFormatValid(s: string): boolean {
  return GSTIN_FORMAT_RE.test(s.trim().toUpperCase());
}

/** Shape of the /api/gstin/[gstin] success payload. */
interface GstinLookupResponse {
  profile: {
    gstin: string;
    /** Derived server-side from gstin chars 3-12 (PAN is embedded in GSTIN
     *  by spec). Always present when gstin is valid. */
    pan: string;
    legalName: string | null;
    tradeName: string | null;
    address: {
      streetAddress: string | null;
      city: string | null;
      state: string | null;
      stateCode: string | null;
      pincode: string | null;
    };
    status: string | null;
    registrationDate: string | null;
    businessType: string | null;
  };
  source: "cache" | "vendor" | "stale-cache";
  vendor: string;
  fetchedAt: string;
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
  openingBalanceLocked = false,
  categories = [],
  customFieldDefinitions = [],
  gstinLookupEnabled = false,
}: {
  businessId: string;
  editingPartyId?: string;
  initial?: PartyFormInitial;
  /** When true, the party already has non-opening ledger activity — the
   *  opening balance card renders read-only with a reason; the field is
   *  omitted from the PATCH payload so the server-side guard never trips. */
  openingBalanceLocked?: boolean;
  /** Workspace party categories, fetched server-side. Empty list = the
   *  Category dropdown is replaced by an inline "manage categories" link. */
  categories?: PartyCategory[];
  /** Workspace custom-field definitions, fetched server-side. Renders one
   *  text input per definition; values flow through `customFieldValues`. */
  customFieldDefinitions?: PartyCustomFieldDefinition[];
  /** Server-side feature flag (true when GSTIN lookup env vars are set).
   *  When false the "Get details" button is hidden — owners type all
   *  fields manually. Single source of truth: `isGstinLookupAvailable()`
   *  in the factory; the API route honours the same flag. */
  gstinLookupEnabled?: boolean;
}) {
  const isEdit = Boolean(editingPartyId);
  const [f, setF] = useState<PartyFormInitial>(initial ?? blank);
  const [busy, setBusy] = useState(false);
  const [gstinFetching, setGstinFetching] = useState(false);
  // Local mirror of the server-supplied list so inline-created categories
  // appear in the dropdown without a page reload.
  const [categoryList, setCategoryList] = useState<PartyCategory[]>(categories);

  async function fetchGstinDetails() {
    const gstin = f.gstin.trim().toUpperCase();
    if (!isGstinFormatValid(gstin)) return;
    setGstinFetching(true);
    try {
      const res = await fetch(`/api/gstin/${encodeURIComponent(gstin)}`);
      const json = (await res.json()) as
        | { ok: true; data: GstinLookupResponse }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      const { profile, source, vendor } = json.data;
      const partyName = profile.legalName?.trim() || profile.tradeName?.trim() || "";
      const derivedPan = profile.pan?.trim().toUpperCase() ?? "";

      // Auto-fill rules — same shape for every field:
      //   - empty target → fill silently
      //   - non-empty target + same value → no-op
      //   - non-empty target + different value → window.confirm
      const shouldOverwriteName =
        partyName !== "" &&
        (!f.name.trim() ||
          (f.name.trim() !== partyName &&
            window.confirm(
              `Replace party name with "${partyName}" from the GST portal?`,
            )));

      const existingPan = f.panNumber.trim().toUpperCase();
      const shouldOverwritePan =
        derivedPan !== "" &&
        (!existingPan ||
          (existingPan !== derivedPan &&
            window.confirm(
              `Replace PAN with "${derivedPan}" derived from this GSTIN?`,
            )));

      const billingIsEmpty = addressIsEmpty(f.billing);
      const newBilling: AddressFormFields = {
        streetAddress: profile.address.streetAddress ?? "",
        city: profile.address.city ?? "",
        stateCode: profile.address.stateCode ?? "",
        pincode: profile.address.pincode ?? "",
      };
      const billingHasAnything =
        newBilling.streetAddress ||
        newBilling.city ||
        newBilling.stateCode ||
        newBilling.pincode;
      const shouldOverwriteBilling =
        Boolean(billingHasAnything) &&
        (billingIsEmpty ||
          window.confirm(
            "Replace billing address with the registered address from the GST portal?",
          ));

      setF((prev) => ({
        ...prev,
        name: shouldOverwriteName ? partyName : prev.name,
        panNumber: shouldOverwritePan ? derivedPan : prev.panNumber,
        billing: shouldOverwriteBilling ? newBilling : prev.billing,
      }));

      // Vendor / source telemetry — useful while we tune the cache TTL.
      const vendorTag = vendor === "mock" ? " (mock data)" : "";
      const sourceTag =
        source === "cache"
          ? " · cached"
          : source === "stale-cache"
            ? " · cached (stale, vendor unreachable)"
            : "";
      toast.success(`GSTIN details fetched${sourceTag}${vendorTag}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "GSTIN lookup failed",
      );
    } finally {
      setGstinFetching(false);
    }
  }

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
        categoryId: f.categoryId || null,
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

      // Custom fields — always include the snapshot, so a cleared field
      // updates to null on the server.
      if (customFieldDefinitions.length > 0) {
        payload.customFields = customFieldDefinitions.map((d) => ({
          definitionId: d.id,
          value: f.customFieldValues[d.id]?.trim() || null,
        }));
      }

      // Opening balance — only sent when unlocked AND amount > 0. The server
      // treats `null` as "set to none" (and on update will DELETE the row),
      // so we explicitly send null when the user cleared a previously-set
      // amount during an edit, to mirror the intent.
      if (!openingBalanceLocked) {
        const amount = f.openingBalanceAmount.trim();
        if (amount && Number(amount) !== 0) {
          payload.openingBalance = {
            amount,
            direction: f.openingBalanceDirection,
            asOfDate: f.openingBalanceAsOfDate || undefined,
          };
        } else if (isEdit) {
          // Edit mode + cleared field = explicit clear intent.
          payload.openingBalance = null;
        }
      }

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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {/* Row 1 — identity + opening balance */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">
                Party name <span className="text-destructive">*</span>
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
                placeholder="Enter email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="opening-balance-amount">
                Opening balance
                {openingBalanceLocked && (
                  <span
                    title="Locked because this party already has invoices or payments"
                    className="ml-1 text-muted-foreground"
                    aria-label="locked"
                  >
                    🔒
                  </span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="opening-balance-amount"
                  value={f.openingBalanceAmount}
                  onChange={(e) => set("openingBalanceAmount", e.target.value)}
                  placeholder="₹ 0"
                  inputMode="decimal"
                  disabled={openingBalanceLocked}
                  className="flex-1"
                />
                <select
                  id="opening-balance-direction"
                  value={f.openingBalanceDirection}
                  onChange={(e) =>
                    set(
                      "openingBalanceDirection",
                      e.target.value as OpeningBalanceDirection,
                    )
                  }
                  className={cn(SELECT_CLASS, "w-32 shrink-0")}
                  disabled={openingBalanceLocked}
                  aria-label="Direction"
                >
                  <option value="to_collect">To collect</option>
                  <option value="to_pay">To pay</option>
                </select>
              </div>
            </div>

            {/* Row 2 — GSTIN | Get Details | PAN | (empty) */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                value={f.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                placeholder="ex: 29XXXXX9438X1XX"
                className="font-mono uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>&nbsp;</Label>
              {gstinLookupEnabled ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={fetchGstinDetails}
                  disabled={!isGstinFormatValid(f.gstin) || gstinFetching}
                  className="h-10"
                >
                  {gstinFetching ? "Fetching…" : "Get details"}
                </Button>
              ) : (
                <div className="hidden md:block" aria-hidden />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pan">PAN number</Label>
              <Input
                id="pan"
                value={f.panNumber}
                onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
                placeholder="Enter party PAN number"
                className="font-mono uppercase"
              />
            </div>
            <div className="hidden md:block" aria-hidden />

            {gstinLookupEnabled && (
              <p className="text-xs text-muted-foreground md:col-span-4">
                Note: You can auto-populate party details from GSTIN.
              </p>
            )}

            {/* Row 3 — Party type | Category | (empty 2 cols) */}
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label>
                Party type <span className="text-destructive">*</span>
              </Label>
              <div className="inline-flex w-fit rounded-md border border-input bg-background p-0.5">
                {(["customer", "supplier"] as const).map((t) => (
                  <label
                    key={t}
                    className={`cursor-pointer rounded px-5 py-1.5 text-sm capitalize transition-colors ${
                      f.type === t
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground"
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
            <div className="md:col-span-2">
              <PartyCategoryField
                businessId={businessId}
                value={f.categoryId}
                onChange={(id) => set("categoryId", id)}
                categories={categoryList}
                onCategoryCreated={(c) =>
                  setCategoryList((prev) => [...prev, c])
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Address</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Billing */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="billing-street" className="text-sm">
                Billing address
              </Label>
              <Textarea
                id="billing-street"
                rows={3}
                value={f.billing.streetAddress}
                onChange={(e) => setBilling("streetAddress", e.target.value)}
                placeholder="Enter billing address"
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  id="billing-city"
                  value={f.billing.city}
                  onChange={(e) => setBilling("city", e.target.value)}
                  placeholder="City"
                />
                <select
                  id="billing-state"
                  value={f.billing.stateCode}
                  onChange={(e) => setBilling("stateCode", e.target.value)}
                  className={SELECT_CLASS}
                  aria-label="State"
                >
                  <option value="">State</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <Input
                  id="billing-pin"
                  value={f.billing.pincode}
                  onChange={(e) => setBilling("pincode", e.target.value)}
                  placeholder="Pincode"
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Shipping */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ship-street" className="text-sm">
                  Shipping address
                </Label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={f.shippingSameAsBilling}
                    onChange={(e) =>
                      set("shippingSameAsBilling", e.target.checked)
                    }
                  />
                  Same as billing address
                </label>
              </div>
              {f.shippingSameAsBilling ? (
                <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-input bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                  Using the billing address.
                </div>
              ) : (
                <>
                  <Textarea
                    id="ship-street"
                    rows={3}
                    value={f.shipping.streetAddress}
                    onChange={(e) =>
                      setShipping("streetAddress", e.target.value)
                    }
                    placeholder="Enter shipping address"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      id="ship-city"
                      value={f.shipping.city}
                      onChange={(e) => setShipping("city", e.target.value)}
                      placeholder="City"
                    />
                    <select
                      id="ship-state"
                      value={f.shipping.stateCode}
                      onChange={(e) => setShipping("stateCode", e.target.value)}
                      className={SELECT_CLASS}
                      aria-label="State"
                    >
                      <option value="">State</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                    <Input
                      id="ship-pin"
                      value={f.shipping.pincode}
                      onChange={(e) => setShipping("pincode", e.target.value)}
                      placeholder="Pincode"
                      inputMode="numeric"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Credit terms</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="credit-period">Credit period</Label>
              <div className="flex gap-2">
                <Input
                  id="credit-period"
                  type="number"
                  min={0}
                  value={f.creditPeriodDays}
                  onChange={(e) => set("creditPeriodDays", e.target.value)}
                  className="flex-1"
                />
                <span className="flex items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  Days
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="credit-limit">Credit limit</Label>
              <Input
                id="credit-limit"
                value={f.creditLimit}
                onChange={(e) => set("creditLimit", e.target.value)}
                placeholder="₹ 0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">
            Contact person details
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-name">Contact person name</Label>
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

      {customFieldDefinitions.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-end justify-between gap-2">
              <h2 className="text-base font-semibold">More details</h2>
              <a
                href={routes.b(businessId).settings.partyCustomFields}
                target="_blank"
                rel="noopener"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Configure fields →
              </a>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {customFieldDefinitions.map((d) => (
                <div key={d.id} className="flex flex-col gap-2">
                  <Label htmlFor={`cf-${d.id}`}>{d.name}</Label>
                  <Input
                    id={`cf-${d.id}`}
                    value={f.customFieldValues[d.id] ?? ""}
                    onChange={(e) =>
                      setF((prev) => ({
                        ...prev,
                        customFieldValues: {
                          ...prev.customFieldValues,
                          [d.id]: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
