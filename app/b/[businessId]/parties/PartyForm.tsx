"use client";
/**
 * Party create + edit form. Same component drives both flows — pass
 * `editingPartyId` to switch into edit mode (POST → PATCH).
 *
 * Step 2 ships the General Details + Party classification + Credit + Contact
 * sections. Address, Bank, Custom Fields modals land in Step 2.5.
 */
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/lib/routes";

export type PartyTypeOption = "customer" | "supplier";

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
};

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
