/**
 * Render orchestration: RenderRequest → HTML (React SSR) → PDF (Puppeteer).
 *
 * ┌─ Fit-to-page (dynamic root font-size) ─────────────────────────────┐
 * │ The templates' CSS uses `rem` throughout, so one root font-size    │
 * │ drives the whole layout. After SSR we set the content, measure the │
 * │ rendered `.doc` height, and pick a root size that makes the        │
 * │ invoice fill the page nicely:                                      │
 * │                                                                    │
 * │   - short invoice  → root size UP (capped) → bigger type, fills    │
 * │   - typical        → root size unchanged                           │
 * │   - slightly long  → root size DOWN (floored) → still one page     │
 * │   - genuinely long → root size unchanged → paginate normally       │
 * │                                                                    │
 * │ The page width (A4) and the `.doc` mm gutter stay fixed, so        │
 * │ scaling type makes the page TALLER, never wider — text reflows     │
 * │ within the same column. No horizontal clipping.                    │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * The Puppeteer Browser is owned by index.ts (one shared instance, launched
 * once) and passed in — launching per request would add ~300ms of cold
 * Chromium start to every invoice.
 *
 * Pagination is Puppeteer's: content flows, and `displayHeaderFooter` draws
 * the footer strip ("Made with AstraBill" + page numbers) on every physical
 * page.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "puppeteer";

import type { RenderRequest } from "./contract.js";
import { TEMPLATES } from "./templates/registry.js";

// ---- A4 geometry (96 dpi: 1mm ≈ 3.7795px) ------------------------------

const A4_WIDTH_PX = 794; // 210mm
const A4_HEIGHT_PX = 1123; // 297mm
// Usable height = page minus top + bottom margins (see page.pdf() margins).
const A4_USABLE_PX = 1029; // 297mm − (9mm top + 16mm bottom)

// ---- fit-to-page tunables ---------------------------------------------

/** The CSS default root size — matches `html { font-size: 11px }` in styles.ts. */
const DEFAULT_BASE = 11;
/**
 * Fraction of usable page height the renderer aims to fill at the chosen
 * root size. < 1 leaves a small bottom breathing room and gives reflow some
 * slack (a 1.0 target risks one line spilling onto page 2 after re-render).
 */
const TARGET_FILL = 0.93;
/** Upper cap on root size — a 1-item invoice scaled too far reads cartoonish. */
const MAX_BASE = 16;
/**
 * Lower floor — below this readability suffers; we paginate at DEFAULT_BASE
 * instead. 8.5 keeps a moderately-loaded invoice (e.g. 3 items + 2 charges
 * + every section) on one page; truly long invoices paginate at default.
 */
const MIN_BASE = 8.5;
/** Don't bother re-rendering for a sub-px adjustment. */
const EPSILON = 0.1;

/**
 * Pick the root font-size that fits the invoice to one page. Content height
 * scales ~linearly with root font-size (modulo wrap-point reflow), so the
 * ideal root = current * targetHeight / measuredHeight.
 *
 * Branches: short → scale up to MAX_BASE; slightly long → scale down to
 * MIN_BASE; genuinely long → leave at default and paginate.
 */
function computeFitBase(measuredHeight: number): number {
  if (measuredHeight <= 0) return DEFAULT_BASE;
  const ideal = (DEFAULT_BASE * A4_USABLE_PX * TARGET_FILL) / measuredHeight;
  if (ideal >= DEFAULT_BASE) return Math.min(ideal, MAX_BASE);
  if (ideal >= MIN_BASE) return ideal;
  return DEFAULT_BASE;
}

/** Per-physical-page footer. Puppeteer fills .pageNumber / .totalPages. */
function footerTemplate(showMark: boolean): string {
  const mark = showMark ? "Made with AstraBill" : "";
  return (
    `<div style="width:100%;box-sizing:border-box;padding:0 14mm;` +
    `font-family:'Helvetica',Arial,sans-serif;font-size:7px;color:#9aa7bd;` +
    `display:flex;justify-content:space-between;align-items:center;">` +
    `<span>${mark}</span>` +
    `<span>Page <span class="pageNumber"></span> / ` +
    `<span class="totalPages"></span></span>` +
    `</div>`
  );
}

export async function renderInvoicePdf(
  req: RenderRequest,
  browser: Browser,
): Promise<Buffer> {
  const Template = TEMPLATES[req.branding.template];
  // Defensive: the body arrived as untyped JSON; a bad `template` is a 4xx,
  // not a 5xx, so the caller can tell it's their mistake.
  if (!Template) {
    throw new RenderError(`Unknown template: ${req.branding.template}`, 400);
  }

  const html0 =
    "<!DOCTYPE html>" + renderToStaticMarkup(createElement(Template, req));

  const page = await browser.newPage();
  try {
    // Match the PDF's print geometry so measurements transfer 1:1.
    await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });
    await page.emulateMediaType("print");

    // First pass at the default root size; `load` waits for the logo image
    // (when set) so it contributes to the measured height correctly.
    await page.setContent(html0, { waitUntil: "load" });

    // The `.doc` is the whole content column — its bounding-rect height in
    // CSS px is exactly what would print between the page margins.
    const measureDocHeight = () =>
      page.evaluate(() => {
        const doc = document.querySelector(".doc");
        return doc ? (doc as HTMLElement).getBoundingClientRect().height : 0;
      });
    const setRoot = (px: number) =>
      page.evaluate((v) => {
        document.documentElement.style.fontSize = `${v}px`;
      }, px);

    const h1 = await measureDocHeight();
    let base = computeFitBase(h1);
    if (Math.abs(base - DEFAULT_BASE) > EPSILON) {
      // Inline style on <html> beats the stylesheet's `html { font-size }`
      // by specificity. Reflowing this way (no re-setContent) keeps the
      // logo image, fonts, and DOM intact — pure layout pass, ~5ms.
      await setRoot(base);

      // Reflow isn't perfectly linear in root font-size — wrap points shift,
      // padding-in-em grows, break-inside rules push blocks whole to the
      // next page. Verify the new height and correct once if we overshot
      // (mostly the upscale case: a short invoice that reflowed taller than
      // the linear estimate predicted).
      const h2 = await measureDocHeight();
      if (h2 > A4_USABLE_PX) {
        const corrected = Math.max(
          MIN_BASE,
          (base * A4_USABLE_PX * TARGET_FILL) / h2,
        );
        if (Math.abs(corrected - base) > EPSILON) {
          base = corrected;
          await setRoot(base);
        }
      }
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      // Empty header — the full invoice header is page-1 content; an empty
      // template still suppresses Puppeteer's default date/title strip.
      headerTemplate: "<div></div>",
      footerTemplate: footerTemplate(req.branding.showFooterMark),
      // Bottom margin leaves room for the footer strip; the top is kept
      // tight so the accent bar hugs the page edge. The template owns its
      // own horizontal gutter.
      margin: { top: "9mm", bottom: "16mm", left: "0mm", right: "0mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** A render failure that carries the HTTP status the caller should see. */
export class RenderError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "RenderError";
    this.status = status;
  }
}
