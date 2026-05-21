/**
 * UPI deep-link helpers. The V1 customer-facing payment mechanism — see
 * `wiki/decision/upi-deep-links.md` for the full rationale.
 *
 * Builds NPCI's standard `upi://pay?...` URL targeting the shop's own VPA.
 * Money moves customer's bank → shop's bank, peer-to-peer; AstraBill never
 * touches it. The same URL string drives both the "Pay ₹X via UPI" button
 * (anchor href) and the QR code rendered next to it.
 *
 * Usable on both the server (share page RSC, PDF microservice) and the
 * browser (settings editor's "Test your link" CTA). No React, no DB.
 */
import QRCode from "qrcode";

export interface UpiPayParams {
  /** Payee VPA (`businesses.upi_id`), e.g. `glasscraft@oksbi`. */
  vpa: string;
  /** Payee display name (`businesses.name`). */
  payeeName: string;
  /** Amount as a decimal string (`invoices.total`). 2dp recommended. */
  amount: string;
  /**
   * Transaction note — the invoice number. Slashes are stripped to hyphens
   * here because some UPI apps mangle the URL-encoded `%2F` in this field.
   * The display invoice number on the rest of the app stays unchanged.
   */
  invoiceNumber?: string | null;
}

/**
 * Build the `upi://pay?...` deep link. Pure — no I/O.
 *
 * Returns null when the VPA is missing or empty so callers can render an
 * "Add your UPI ID" empty state instead of a broken button.
 */
export function buildUpiPayUrl(params: UpiPayParams): string | null {
  const vpa = params.vpa.trim();
  if (!vpa) return null;

  const tn = (params.invoiceNumber ?? "")
    .replace(/\//g, "-")
    .replace(/\s+/g, "")
    .slice(0, 50);

  const search = new URLSearchParams({
    pa: vpa,
    pn: params.payeeName.trim(),
    am: params.amount,
    cu: "INR",
  });
  if (tn) search.set("tn", tn);

  // URLSearchParams encodes spaces as `+`; UPI apps want `%20`. The spec
  // is RFC 3986, which `+` doesn't satisfy in the path/query for this
  // scheme.
  return `upi://pay?${search.toString().replace(/\+/g, "%20")}`;
}

/**
 * Render the given URL as an SVG QR code, returned as a string. Embed
 * directly in HTML/JSX via `dangerouslySetInnerHTML={{ __html }}` or, on
 * the PDF side, raw string interpolation.
 *
 * Defaults tuned for invoice + share-page use: Medium error correction
 * (printable, slightly damage-tolerant), tight margin so the QR doesn't
 * eat space.
 */
export async function renderUpiQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 200,
  });
}

/**
 * Same as `renderUpiQrSvg` but returns a base64 PNG data URL. Use this
 * when SVG inlining isn't an option (some PDF pipelines, or when the QR
 * must be wrapped in `<img src>` for layout reasons).
 */
export async function renderUpiQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 400,
  });
}
