"use client";
/**
 * PaymentSettingsEditor — the client half of /settings/payments.
 *
 * V1 carries one field: the business's UPI VPA. When set, the public share
 * page and the invoice PDF render a "Pay ₹X via UPI" button + QR code that
 * targets this VPA via NPCI's standard deep link.
 *
 * The "Test your link" button is a runtime sanity-check — opens the user's
 * own UPI app with a ₹1 payment to themselves. If their phone doesn't fire
 * up GPay/PhonePe/Paytm, the VPA is mistyped or their UPI app isn't
 * installed; better to know now than after the first customer.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildUpiPayUrl } from "@/lib/upi";

const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export function PaymentSettingsEditor({
  businessId,
  businessName,
  canEdit,
  initialUpiId,
}: {
  businessId: string;
  businessName: string;
  canEdit: boolean;
  initialUpiId: string | null;
}) {
  const [saved, setSaved] = useState<string | null>(initialUpiId);
  const [draft, setDraft] = useState<string>(initialUpiId ?? "");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const trimmed = draft.trim();
  const dirty = (saved ?? "") !== trimmed;
  const formatValid = trimmed === "" || VPA_REGEX.test(trimmed);
  const canSave = canEdit && dirty && formatValid && !busy;

  // ₹1 self-payment link, built from whatever the user has currently typed
  // (not what they've saved — the whole point is "did I type this right?").
  const testLink = useMemo(() => {
    if (!VPA_REGEX.test(trimmed)) return null;
    return buildUpiPayUrl({
      vpa: trimmed,
      payeeName: businessName,
      amount: "1.00",
      invoiceNumber: "TEST",
    });
  }, [trimmed, businessName]);

  async function save() {
    setBusy(true);
    try {
      const next = trimmed === "" ? null : trimmed;
      const res = await fetch(
        `/api/businesses/${businessId}/payment-settings`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ upiId: next }),
        },
      );
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      setSaved(next);
      setJustSaved(true);
      toast.success(
        next
          ? "UPI ID saved — your invoices now show a Pay button."
          : "UPI ID cleared — the Pay button is hidden on new invoices.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save UPI ID",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold">Accept UPI payments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When you set your UPI ID, every invoice you share gets a{" "}
            <span className="font-semibold text-foreground">
              Pay via UPI
            </span>{" "}
            button and QR code. Customers tap it, their UPI app opens with
            the exact amount, and the money lands in your account directly.
            AstraBill never touches the funds.
          </p>

          <div className="mt-5 flex flex-col gap-1.5">
            <Label htmlFor="upi">Your UPI ID</Label>
            <Input
              id="upi"
              value={draft}
              disabled={!canEdit || busy}
              onChange={(e) => {
                setDraft(e.target.value);
                setJustSaved(false);
              }}
              placeholder="e.g. ramesh@oksbi"
              autoComplete="off"
              spellCheck={false}
              inputMode="email"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Looks like{" "}
              <span className="font-mono">your-name@bank</span> — exactly
              the address you’d give a friend to receive money on GPay,
              PhonePe, or Paytm.
            </p>
            {!formatValid && (
              <p className="text-xs text-destructive">
                That doesn’t look like a UPI ID. Should be something like
                <span className="ml-1 font-mono">ramesh@oksbi</span>.
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={!canSave}
              onClick={save}
            >
              {busy ? "Saving…" : "Save UPI ID"}
            </Button>
            {testLink && (
              <a
                href={testLink}
                className="text-sm font-medium text-primary hover:underline"
              >
                Test it (send yourself ₹1) →
              </a>
            )}
            {justSaved && !dirty && (
              <span className="text-sm text-muted-foreground">
                Saved.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold">How customers pay you</h3>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground marker:text-foreground">
            <li>
              You send an invoice on WhatsApp. The customer taps{" "}
              <span className="font-semibold text-foreground">
                View Invoice
              </span>
              .
            </li>
            <li>
              On the invoice page they tap{" "}
              <span className="font-semibold text-foreground">
                Pay ₹X via UPI
              </span>
              . Their GPay / PhonePe / Paytm opens with the amount
              pre-filled.
            </li>
            <li>
              They pay. Money arrives in your account — your bank texts you
              the confirmation, the same way it does today.
            </li>
            <li>
              You open the invoice in AstraBill and tap{" "}
              <span className="font-semibold text-foreground">
                Record payment
              </span>{" "}
              to mark it paid.
            </li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Auto-reconciliation (the invoice marks itself paid the moment
            money lands) is a paid-plan feature we’re building next.
          </p>
        </CardContent>
      </Card>

      {!canEdit && (
        <div
          role="status"
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          Only an owner can change payment settings.
        </div>
      )}
    </div>
  );
}
