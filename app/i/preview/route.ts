/**
 * GET /i/preview — branding preview PDF for the /settings/branding iframe.
 *
 * The branding-editor's right pane is an iframe pointed here; its query string
 * carries the *unsaved* settings the user is dragging around. Renders the
 * business's most-recent finalised invoice (or a sample) through the same
 * pdf-service the real download uses — so the preview is, literally, the print
 * output. Streams `application/pdf` inline; never cached (the params change
 * keystroke to keystroke).
 *
 * `showFooterMark` is NOT a query param — it's plan-derived in the service, so
 * a free-plan user cannot fake away the "Made with AstraBill" footer here.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { isOurCloudinaryUrl } from "@/lib/cloudinary";
import { parseQuery, route } from "@/lib/http";
import {
  renderBrandingPreviewPdf,
  type PreviewBranding,
} from "@/lib/services/document-pdf";
import { requireUser } from "@/lib/session";

const COLUMN_KEYS = [
  "hsn",
  "batch",
  "mfg",
  "exp",
  "discount",
  "tax",
  "secondaryQty",
] as const;

const querySchema = z.object({
  businessId: z.string().uuid(),
  template: z.enum(["modern", "classic"]).default("modern"),
  // Hex without the leading `#` — `#` is a URL fragment and would be dropped.
  color: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/, "color must be 6 hex digits")
    .default("2563eb"),
  font: z
    .enum(["inter", "poppins", "noto_serif", "noto_sans"])
    .default("inter"),
  logo: z.string().url().max(500).optional(),
  /** Comma-separated list of the column keys that are switched ON. */
  cols: z.string().max(120).optional(),
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, querySchema);

  const enabled = new Set(
    (q.cols ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const columns = Object.fromEntries(
    COLUMN_KEYS.map((k) => [k, enabled.has(k)]),
  ) as PreviewBranding["columns"];

  // A logo URL must live on our own Cloudinary cloud — the renderer must never
  // be aimed at an arbitrary host. An invalid one is silently dropped.
  const logoUrl =
    q.logo && isOurCloudinaryUrl(q.logo) ? q.logo : null;

  const bytes = await renderBrandingPreviewPdf(q.businessId, user.id, {
    logoUrl,
    color: `#${q.color}`,
    font: q.font,
    template: q.template,
    columns,
  });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "inline",
      "cache-control": "private, no-store",
    },
  });
});
