"use client";
/**
 * PrintSettingsEditor — the interactive half of /settings/print-settings.
 *
 * Renamed from BrandingEditor in Phase 3; same UX (template, colour, font,
 * columns, logo) — just relocated under the more discoverable IA bucket.
 *
 * Left pane: a logo uploader + a tabbed control set (Template · Colors · Font ·
 * Columns). Right pane: a live-preview iframe pointed at /i/preview, which
 * renders the business's real most-recent invoice through the actual
 * pdf-service — so the preview *is* the print output.
 *
 * Nothing persists until Save: the controls drive local state, the preview
 * reflects that state (debounced), and Save sends one PATCH to
 * /api/businesses/[id]. The logo uploads straight to Cloudinary with a
 * server-signed request (the file never passes through Next.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ---- known values ------------------------------------------------------

const TEMPLATES = ["modern", "classic"] as const;
const FONTS = ["inter", "poppins", "noto_serif", "noto_sans"] as const;
const ALL_COLUMNS = [
  "hsn",
  "batch",
  "mfg",
  "exp",
  "discount",
  "tax",
  "secondaryQty",
] as const;

type Template = (typeof TEMPLATES)[number];
type Font = (typeof FONTS)[number];
type ColumnKey = (typeof ALL_COLUMNS)[number];
type ColumnFlags = Record<ColumnKey, boolean>;

function asTemplate(v: string): Template {
  return (TEMPLATES as readonly string[]).includes(v)
    ? (v as Template)
    : "modern";
}
function asFont(v: string): Font {
  return (FONTS as readonly string[]).includes(v) ? (v as Font) : "inter";
}

const TEMPLATE_INFO: Record<Template, { name: string; blurb: string }> = {
  modern: {
    name: "Modern",
    blurb:
      "Borderless and airy, with brand-colour accents. Reads best on a phone — the default.",
  },
  classic: {
    name: "Classic",
    blurb:
      "A traditional ruled invoice — centred header, gridded items, signature block.",
  },
};

const FONT_INFO: Record<Font, { name: string; blurb: string }> = {
  inter: { name: "Inter", blurb: "Clean modern sans-serif. The default." },
  poppins: {
    name: "Poppins",
    blurb: "Geometric and friendly — rounder letterforms.",
  },
  noto_serif: {
    name: "Noto Serif",
    blurb: "Traditional serif — a formal, printed feel.",
  },
  noto_sans: {
    name: "Noto Sans",
    blurb: "Neutral sans with full Devanagari — pick this for a Hindi name.",
  },
};

const EDITABLE_COLUMNS: Array<{ key: ColumnKey; label: string; blurb: string }> =
  [
    { key: "hsn", label: "HSN / SAC code", blurb: "The tax classification code column." },
    { key: "discount", label: "Discount", blurb: "Per-line discount amount." },
    { key: "tax", label: "GST rate", blurb: "The per-line GST percentage." },
    {
      key: "secondaryQty",
      label: "Secondary quantity",
      blurb: "The informational second unit (e.g. pieces alongside sq.m).",
    },
  ];

const COLOR_PRESETS = [
  "#2563eb",
  "#0ea5e9",
  "#059669",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#7c3aed",
  "#0f172a",
];

// ---- types -------------------------------------------------------------

export interface PrintSettingsInitial {
  template: string;
  color: string;
  font: string;
  logoUrl: string | null;
  columns: ColumnFlags;
}

type EditorState = {
  template: Template;
  color: string;
  font: Font;
  logoUrl: string | null;
  columns: ColumnFlags;
};

function toState(initial: PrintSettingsInitial): EditorState {
  return {
    template: asTemplate(initial.template),
    color: /^#[0-9a-fA-F]{6}$/.test(initial.color)
      ? initial.color.toLowerCase()
      : "#2563eb",
    font: asFont(initial.font),
    logoUrl: initial.logoUrl,
    columns: { ...initial.columns },
  };
}

type Tab = "template" | "colors" | "font" | "columns";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "template", label: "Template" },
  { id: "colors", label: "Colors" },
  { id: "font", label: "Font" },
  { id: "columns", label: "Columns" },
];

// ---- component ---------------------------------------------------------

export function PrintSettingsEditor({
  businessId,
  canEdit,
  isFreePlan,
  initial,
}: {
  businessId: string;
  canEdit: boolean;
  isFreePlan: boolean;
  initial: PrintSettingsInitial;
}) {
  const [saved, setSaved] = useState(() => toState(initial));
  const [s, setS] = useState<EditorState>(saved);
  const [tab, setTab] = useState<Tab>("template");
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () => JSON.stringify(s) !== JSON.stringify(saved),
    [s, saved],
  );

  // ---- live preview (debounced) ----------------------------------------

  const buildSrc = useCallback(
    (st: EditorState) => {
      const cols = ALL_COLUMNS.filter((k) => st.columns[k]).join(",");
      const p = new URLSearchParams({
        businessId,
        template: st.template,
        color: st.color.replace(/^#/, ""),
        font: st.font,
        cols,
      });
      if (st.logoUrl) p.set("logo", st.logoUrl);
      return `/i/preview?${p.toString()}`;
    },
    [businessId],
  );

  const [previewSrc, setPreviewSrc] = useState(() => buildSrc(saved));
  const [previewStale, setPreviewStale] = useState(false);

  useEffect(() => {
    setPreviewStale(true);
    const next = buildSrc(s);
    const timer = setTimeout(() => setPreviewSrc(next), 500);
    return () => clearTimeout(timer);
  }, [s, buildSrc]);

  // ---- actions ---------------------------------------------------------

  function patch(p: Partial<EditorState>) {
    setS((prev) => ({ ...prev, ...p }));
    setJustSaved(false);
  }

  async function uploadLogo(file: File) {
    setUploadBusy(true);
    setError(null);
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
        throw new Error(upJson.error?.message ?? "Logo upload failed");
      }
      patch({ logoUrl: upJson.secure_url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${businessId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandColor: s.color,
          brandFont: s.font,
          documentTemplateId: s.template,
          documentSettings: { columns: s.columns },
          logoUrl: s.logoUrl,
        }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      setSaved(s);
      setJustSaved(true);
      posthog.capture("print_settings_saved", {
        business_id: businessId,
        template: s.template,
        font: s.font,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  }

  const locked = !canEdit;

  return (
    <div className="flex flex-col gap-6">
      {locked && (
        <div
          role="status"
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          Only an owner can change invoice branding. You can preview the
          current look below.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ---- left: controls ---- */}
        <div className="flex flex-col gap-5">
          {/* logo */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold">Logo</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Shown at the top of every invoice. PNG or JPG, ideally on a
                transparent or white background.
              </p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.logoUrl}
                      alt="Business logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No logo
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadLogo(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked || uploadBusy}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploadBusy
                      ? "Uploading…"
                      : s.logoUrl
                        ? "Replace logo"
                        : "Upload logo"}
                  </Button>
                  {s.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={locked || uploadBusy}
                      onClick={() => patch({ logoUrl: null })}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* tabs */}
          <Card>
            <CardContent className="pt-6">
              <div
                role="tablist"
                aria-label="Branding settings"
                className="flex gap-1 border-b border-border"
              >
                {TABS.map((tb) => (
                  <button
                    key={tb.id}
                    role="tab"
                    type="button"
                    aria-selected={tab === tb.id}
                    onClick={() => setTab(tb.id)}
                    className={cn(
                      "-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
                      tab === tb.id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tb.label}
                  </button>
                ))}
              </div>

              <div className="pt-5">
                {tab === "template" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={locked}
                        onClick={() => patch({ template: t })}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                          s.template === t
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        <TemplateThumb template={t} color={s.color} />
                        <div className="mt-2.5 text-sm font-semibold">
                          {TEMPLATE_INFO[t].name}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {TEMPLATE_INFO[t].blurb}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {tab === "colors" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        aria-label="Brand colour"
                        disabled={locked}
                        value={s.color}
                        onChange={(e) =>
                          patch({ color: e.target.value.toLowerCase() })
                        }
                        className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-background disabled:cursor-not-allowed"
                      />
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="hex">Hex</Label>
                        <Input
                          id="hex"
                          value={s.color}
                          disabled={locked}
                          onChange={(e) => {
                            const v = e.target.value.toLowerCase();
                            patch({ color: v });
                          }}
                          className="w-32 font-mono uppercase"
                          placeholder="#2563eb"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        Presets
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Use ${c}`}
                            disabled={locked}
                            onClick={() => patch({ color: c })}
                            style={{ background: c }}
                            className={cn(
                              "h-8 w-8 rounded-md border transition-transform hover:scale-110 disabled:cursor-not-allowed",
                              s.color === c
                                ? "border-foreground ring-2 ring-foreground/30"
                                : "border-border",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    {!/^#[0-9a-fA-F]{6}$/.test(s.color) && (
                      <p className="text-xs text-destructive">
                        Enter a 6-digit hex colour like #2563eb.
                      </p>
                    )}
                  </div>
                )}

                {tab === "font" && (
                  <div className="flex flex-col gap-2">
                    {FONTS.map((f) => (
                      <label
                        key={f}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          s.font === f
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/50",
                          locked && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <input
                          type="radio"
                          name="font"
                          className="mt-0.5 h-4 w-4 accent-primary"
                          disabled={locked}
                          checked={s.font === f}
                          onChange={() => patch({ font: f })}
                        />
                        <span>
                          <span className="block text-sm font-semibold">
                            {FONT_INFO[f].name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {FONT_INFO[f].blurb}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {tab === "columns" && (
                  <div className="flex flex-col gap-3">
                    {isFreePlan && (
                      <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                        Column visibility is a paid-plan feature. On the Free
                        plan every column shows.
                      </div>
                    )}
                    {EDITABLE_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border border-border p-3",
                          (locked || isFreePlan) &&
                            "cursor-not-allowed opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-primary"
                          disabled={locked || isFreePlan}
                          checked={s.columns[col.key]}
                          onChange={(e) =>
                            patch({
                              columns: {
                                ...s.columns,
                                [col.key]: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>
                          <span className="block text-sm font-semibold">
                            {col.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {col.blurb}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* save bar */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {error && (
              <span role="alert" className="mr-auto text-sm text-destructive">
                {error}
              </span>
            )}
            {justSaved && !dirty && (
              <span className="mr-auto text-sm text-muted-foreground">
                Saved — new invoices use this branding.
              </span>
            )}
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={
                locked ||
                busy ||
                !dirty ||
                !/^#[0-9a-fA-F]{6}$/.test(s.color)
              }
              onClick={save}
            >
              {busy ? "Saving…" : "Save print settings"}
            </Button>
          </div>
        </div>

        {/* ---- right: live preview ---- */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Live preview</h2>
                {previewStale && (
                  <span className="text-xs text-muted-foreground">
                    Updating…
                  </span>
                )}
              </div>
              <iframe
                key={previewSrc}
                src={previewSrc}
                title="Invoice preview"
                onLoad={() => setPreviewStale(false)}
                className="aspect-210/297 w-full rounded-md border border-border bg-muted"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Your most-recent invoice, rendered with the settings above.
                Unsaved changes show here before you save.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---- tiny template thumbnail (pure CSS, no asset) ----------------------

function TemplateThumb({
  template,
  color,
}: {
  template: Template;
  color: string;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2563eb";
  if (template === "modern") {
    return (
      <div className="flex h-24 flex-col gap-1.5 rounded-md bg-white p-3 shadow-inner">
        <div className="h-1 w-full rounded" style={{ background: safe }} />
        <div className="h-2 w-1/2 rounded bg-slate-300" />
        <div className="mt-1 h-2.5 w-full rounded" style={{ background: safe }} />
        <div className="h-1.5 w-full rounded bg-slate-200" />
        <div className="h-1.5 w-full rounded bg-slate-200" />
        <div className="mt-auto h-3 w-1/3 self-end rounded" style={{ background: safe }} />
      </div>
    );
  }
  return (
    <div className="flex h-24 flex-col gap-1 rounded-md border-2 bg-white p-2" style={{ borderColor: safe }}>
      <div className="mx-auto h-2 w-1/2 rounded bg-slate-400" />
      <div className="mx-auto mb-0.5 h-1.5 w-1/4 rounded bg-slate-200" />
      <div className="grid flex-1 grid-cols-3 gap-px bg-slate-300">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-white" />
        ))}
      </div>
    </div>
  );
}
