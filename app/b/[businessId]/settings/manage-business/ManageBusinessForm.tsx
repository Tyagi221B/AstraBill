"use client";
/**
 * ManageBusinessForm — the dense "business profile" form (logo, identity,
 * address, GST/PAN, business type, signature, additional invoice details,
 * tax-feature toggles). Mirrors the structure on the screenshot in
 * wiki/screens/mybillbook-manage-business.png.
 *
 * State model: one big `EditorState` object derived from the server-fetched
 * business row. `dirty` is a JSON-string diff against `saved`; Save sends a
 * partial PATCH carrying only fields whose values differ from `saved`.
 *
 * Uploads (logo + signature) hit `/api/uploads/signature` for a Cloudinary
 * signed-upload payload, then POST the file directly to Cloudinary — Next
 * never sees the bytes. The returned URL is then stored on save.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BUSINESS_REGISTRATION_TYPES,
  BUSINESS_REGISTRATION_TYPE_LABELS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  INDUSTRY_TYPES,
  INDUSTRY_TYPE_LABELS,
  type BusinessRegistrationType,
  type BusinessType,
  type IndustryType,
  type SignatureMode,
} from "@/lib/constants/business-profile";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import { cn } from "@/lib/utils";

// ---- types -------------------------------------------------------------

export interface ManageBusinessInitial {
  name: string;
  isGstRegistered: boolean;
  gstin: string | null;
  panNumber: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  logoUrl: string | null;
  businessType: BusinessType[];
  industryType: IndustryType | null;
  businessRegistrationType: BusinessRegistrationType | null;
  signatureUrl: string | null;
  signatureMode: SignatureMode;
  signatoryName: string | null;
  additionalDetails: Record<string, string>;
  enableTds: boolean;
  enableTcs: boolean;
  fyStartMonth: number;
}

type EditorState = ManageBusinessInitial;

const FY_START_MONTHS = [
  { value: 4, label: "April (Indian FY)" },
  { value: 1, label: "January (Calendar year)" },
  { value: 7, label: "July" },
  { value: 10, label: "October" },
] as const;

// ---- component ---------------------------------------------------------

export function ManageBusinessForm({
  businessId,
  canEdit,
  initial,
}: {
  businessId: string;
  canEdit: boolean;
  initial: ManageBusinessInitial;
}) {
  const [saved, setSaved] = useState<EditorState>(initial);
  const [s, setS] = useState<EditorState>(initial);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [sigBusy, setSigBusy] = useState(false);

  const logoRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () => JSON.stringify(s) !== JSON.stringify(saved),
    [s, saved],
  );

  const patch = useCallback((p: Partial<EditorState>) => {
    setS((prev) => ({ ...prev, ...p }));
  }, []);

  // ---- uploads -------------------------------------------------------

  async function uploadImage(file: File, kind: "logo" | "signature") {
    const setBusyFn = kind === "logo" ? setLogoBusy : setSigBusy;
    setBusyFn(true);
    try {
      const sigRes = await fetch("/api/uploads/signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const sigJson = (await sigRes.json()) as
        | {
            ok: true;
            data: {
              cloudName: string;
              apiKey: string;
              timestamp: number;
              signature: string;
              assetFolder: string;
            };
          }
        | { ok: false; error: { message: string } };
      if (!sigJson.ok) throw new Error(sigJson.error.message);

      const { cloudName, apiKey, timestamp, signature, assetFolder } =
        sigJson.data;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", apiKey);
      fd.append("timestamp", String(timestamp));
      fd.append("signature", signature);
      fd.append("asset_folder", assetFolder);

      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: fd },
      );
      const upJson = (await upRes.json()) as {
        secure_url?: string;
        error?: { message?: string };
      };
      if (!upRes.ok || !upJson.secure_url) {
        throw new Error(upJson.error?.message ?? "Upload failed");
      }
      if (kind === "logo") patch({ logoUrl: upJson.secure_url });
      else patch({ signatureUrl: upJson.secure_url, signatureMode: "uploaded" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${kind} upload failed`);
    } finally {
      setBusyFn(false);
      if (kind === "logo" && logoRef.current) logoRef.current.value = "";
      if (kind === "signature" && sigRef.current) sigRef.current.value = "";
    }
  }

  // ---- save ----------------------------------------------------------

  async function save() {
    if (!s.name.trim()) {
      toast.error("Business name is required");
      return;
    }
    setBusy(true);
    try {
      // Send only fields that changed against `saved`. Includes logoUrl —
      // the profile PATCH supports it (same Cloudinary-host check as the
      // branding route) and this form is the primary surface for it.
      const body = diffPatch(
        saved as unknown as Record<string, unknown>,
        s as unknown as Record<string, unknown>,
      );
      const res = await fetch(`/api/businesses/${businessId}/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      setSaved(s);
      toast.success("Business settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save changes",
      );
    } finally {
      setBusy(false);
    }
  }

  // ---- render --------------------------------------------------------

  const locked = !canEdit;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">
            Business Settings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit your company settings and the information that appears on
            every invoice.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {dirty && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setS(saved)}
              disabled={busy}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={locked || busy || !dirty || !s.name.trim()}
            onClick={save}
          >
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {locked && (
        <div
          role="status"
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          Only an owner can change business settings. You can view the current
          values below.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ---- left column ---- */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-5">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {s.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.logoUrl}
                        alt="Business logo"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Logo
                      </span>
                    )}
                  </div>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadImage(f, "logo");
                    }}
                  />
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      disabled={locked || logoBusy}
                      onClick={() => logoRef.current?.click()}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                    >
                      {logoBusy
                        ? "Uploading…"
                        : s.logoUrl
                          ? "Change"
                          : "Upload logo"}
                    </button>
                    {s.logoUrl && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => patch({ logoUrl: null })}
                        className="text-xs text-destructive hover:underline disabled:opacity-60"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <Field
                    label="Business Name"
                    required
                    htmlFor="biz-name"
                  >
                    <Input
                      id="biz-name"
                      value={s.name}
                      disabled={locked}
                      onChange={(e) => patch({ name: e.target.value })}
                      placeholder="My Business"
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Company Phone Number" htmlFor="biz-phone">
                      <Input
                        id="biz-phone"
                        value={s.phone ?? ""}
                        disabled={locked}
                        onChange={(e) =>
                          patch({ phone: toNullable(e.target.value) })
                        }
                        placeholder="9876543210"
                        inputMode="tel"
                      />
                    </Field>
                    <Field label="Company E-Mail" htmlFor="biz-email">
                      <Input
                        id="biz-email"
                        type="email"
                        value={s.email ?? ""}
                        disabled={locked}
                        onChange={(e) =>
                          patch({ email: toNullable(e.target.value) })
                        }
                        placeholder="hello@business.com"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* address */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold">Billing Address</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Printed on every invoice and used for GST place-of-supply
                math.
              </p>
              <div className="mt-4 space-y-4">
                <Field label="Address" htmlFor="addr1">
                  <Textarea
                    id="addr1"
                    value={joinAddress(s.addressLine1, s.addressLine2)}
                    disabled={locked}
                    onChange={(e) => {
                      const [l1, ...rest] = e.target.value.split("\n");
                      patch({
                        addressLine1: toNullable(l1 ?? ""),
                        addressLine2: toNullable(rest.join("\n")),
                      });
                    }}
                    rows={2}
                    placeholder="Street, building, locality"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="State" htmlFor="state">
                    <select
                      id="state"
                      value={s.stateCode ?? ""}
                      disabled={locked}
                      onChange={(e) => {
                        const code = e.target.value || null;
                        const match = INDIAN_STATES.find((x) => x.code === code);
                        patch({
                          stateCode: code,
                          state: match?.name ?? null,
                        });
                      }}
                      className={selectClass}
                    >
                      <option value="">Select state…</option>
                      {INDIAN_STATES.map((st) => (
                        <option key={st.code} value={st.code}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pincode" htmlFor="pin">
                    <Input
                      id="pin"
                      value={s.pincode ?? ""}
                      disabled={locked}
                      onChange={(e) =>
                        patch({ pincode: toNullable(e.target.value) })
                      }
                      placeholder="247667"
                      inputMode="numeric"
                      maxLength={6}
                    />
                  </Field>
                </div>
                <Field label="City" htmlFor="city">
                  <Input
                    id="city"
                    value={s.city ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patch({ city: toNullable(e.target.value) })
                    }
                    placeholder="Haridwar"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* GST + PAN + toggles */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold">Tax Identity</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your GST status drives which document types you can issue and
                how tax is computed.
              </p>
              <div className="mt-4 space-y-4">
                <Field label="Are you GST Registered?" htmlFor="">
                  <div className="flex gap-2">
                    <RadioCard
                      checked={s.isGstRegistered}
                      onClick={() =>
                        !locked && patch({ isGstRegistered: true })
                      }
                      label="Yes"
                    />
                    <RadioCard
                      checked={!s.isGstRegistered}
                      onClick={() =>
                        !locked &&
                        patch({ isGstRegistered: false, gstin: null })
                      }
                      label="No"
                    />
                  </div>
                </Field>
                {s.isGstRegistered && (
                  <Field label="GSTIN" htmlFor="gstin">
                    <Input
                      id="gstin"
                      value={s.gstin ?? ""}
                      disabled={locked}
                      onChange={(e) =>
                        patch({
                          gstin: toNullable(e.target.value.toUpperCase()),
                        })
                      }
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                      className="font-mono uppercase"
                    />
                  </Field>
                )}
                <Field label="PAN Number" htmlFor="pan">
                  <Input
                    id="pan"
                    value={s.panNumber ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patch({
                        panNumber: toNullable(e.target.value.toUpperCase()),
                      })
                    }
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className="font-mono uppercase"
                  />
                </Field>
                <ToggleRow
                  label="Enable e-Invoicing"
                  description="IRP integration for businesses with ₹5cr+ turnover."
                  badge="Pro"
                  checked={false}
                  disabled
                  onChange={() => {}}
                />
                <ToggleRow
                  label="Enable TDS"
                  description="Withhold and report TDS on purchase invoices."
                  badge="Pro"
                  checked={s.enableTds}
                  disabled={locked}
                  onChange={(v) => patch({ enableTds: v })}
                />
                <ToggleRow
                  label="Enable TCS"
                  description="Collect and report TCS on sales invoices."
                  badge="Pro"
                  checked={s.enableTcs}
                  disabled={locked}
                  onChange={(v) => patch({ enableTcs: v })}
                />
              </div>
            </CardContent>
          </Card>

          {/* FY */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold">Financial Year</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Drives doc number rollover and which reports default to FY
                vs calendar year.
              </p>
              <div className="mt-4">
                <Field label="FY starts in" htmlFor="fy-start">
                  <select
                    id="fy-start"
                    value={s.fyStartMonth}
                    disabled={locked}
                    onChange={(e) =>
                      patch({ fyStartMonth: Number(e.target.value) })
                    }
                    className={selectClass}
                  >
                    {FY_START_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---- right column ---- */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold">Profile</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Helps us tailor invoice templates and reports to your trade.
              </p>
              <div className="mt-4 space-y-4">
                <Field label="Business Type (Select multiple)" htmlFor="">
                  <div className="flex flex-wrap gap-1.5">
                    {BUSINESS_TYPES.map((t) => {
                      const on = s.businessType.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            patch({
                              businessType: on
                                ? s.businessType.filter((x) => x !== t)
                                : [...s.businessType, t],
                            });
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                          )}
                        >
                          {BUSINESS_TYPE_LABELS[t]}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Industry Type" htmlFor="industry">
                  <select
                    id="industry"
                    value={s.industryType ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patch({
                        industryType:
                          (e.target.value as IndustryType) || null,
                      })
                    }
                    className={selectClass}
                  >
                    <option value="">Select industry…</option>
                    {INDUSTRY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {INDUSTRY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Business Registration Type"
                  htmlFor="registration"
                >
                  <select
                    id="registration"
                    value={s.businessRegistrationType ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patch({
                        businessRegistrationType:
                          (e.target.value as BusinessRegistrationType) || null,
                      })
                    }
                    className={selectClass}
                  >
                    <option value="">Select registration type…</option>
                    {BUSINESS_REGISTRATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {BUSINESS_REGISTRATION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Signature */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold">Signature</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Printed in the signature block at the bottom of every invoice.
              </p>
              <div className="mt-4">
                <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/30">
                  {s.signatureMode === "uploaded" && s.signatureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.signatureUrl}
                      alt="Signature"
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Empty box · sign by hand after printing
                    </span>
                  )}
                </div>
                <input
                  ref={sigRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f, "signature");
                  }}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked || sigBusy}
                    onClick={() => sigRef.current?.click()}
                  >
                    {sigBusy
                      ? "Uploading…"
                      : s.signatureUrl
                        ? "Replace signature"
                        : "Upload signature"}
                  </Button>
                  {s.signatureUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={locked}
                      onClick={() =>
                        patch({
                          signatureUrl: null,
                          signatureMode: "empty_box",
                        })
                      }
                      className="text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <Field
                  label="Signatory name (optional)"
                  htmlFor="signatory"
                  className="mt-4"
                >
                  <Input
                    id="signatory"
                    value={s.signatoryName ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patch({ signatoryName: toNullable(e.target.value) })
                    }
                    placeholder='Defaults to "Authorized Signatory"'
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Additional details */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold">Add Business Details</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Free-form fields (Website, MSME number, Drug License, …) —
                each one is printed on every invoice.
              </p>
              <AdditionalDetails
                value={s.additionalDetails}
                disabled={locked}
                onChange={(v) => patch({ additionalDetails: v })}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---- small primitives --------------------------------------------------

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  label,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function RadioCard({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 flex-1 items-center justify-between rounded-md border px-3 text-sm transition-colors",
        checked
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-foreground hover:border-primary/50",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border-2",
          checked ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
    </button>
  );
}

function ToggleRow({
  label,
  description,
  badge,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  badge?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5",
        disabled && "opacity-60",
      )}
    >
      <span className="flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {badge && (
            <span className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function AdditionalDetails({
  value,
  disabled,
  onChange,
}: {
  value: Record<string, string>;
  disabled?: boolean;
  onChange: (v: Record<string, string>) => void;
}) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const entries = Object.entries(value);

  function addRow() {
    const key = k.trim();
    const val = v.trim();
    if (!key || !val) return;
    onChange({ ...value, [key]: val });
    setK("");
    setV("");
  }

  function removeRow(key: string) {
    const { [key]: _, ...rest } = value;
    onChange(rest);
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-0">
          <Input
            value={k}
            disabled={disabled}
            onChange={(e) => setK(e.target.value)}
            placeholder="Label (e.g. Website)"
          />
        </div>
        <span className="pb-2.5 text-muted-foreground">=</span>
        <div className="flex-1 min-w-0">
          <Input
            value={v}
            disabled={disabled}
            onChange={(e) => setV(e.target.value)}
            placeholder="Value (e.g. www.business.com)"
          />
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={disabled || !k.trim() || !v.trim()}
          onClick={addRow}
        >
          Add
        </Button>
      </div>
      {entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map(([key, val]) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-foreground">{key}</span>
                <span className="mx-2 text-muted-foreground">=</span>
                <span className="text-muted-foreground">{val}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${key}`}
                disabled={disabled}
                onClick={() => removeRow(key)}
                className="text-xs text-destructive hover:underline disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- helpers -----------------------------------------------------------

function toNullable(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function joinAddress(l1: string | null, l2: string | null): string {
  return [l1, l2].filter(Boolean).join("\n");
}

/** Send only fields whose values differ from `from`. JSON-stringify
 *  comparison handles objects/arrays correctly for our shapes. */
function diffPatch<T extends Record<string, unknown>>(
  from: T,
  to: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(to) as Array<keyof T>) {
    if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
      out[key] = to[key];
    }
  }
  return out;
}
