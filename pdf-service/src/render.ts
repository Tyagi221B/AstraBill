/**
 * Render orchestration: RenderRequest → HTML (React SSR) → PDF (Puppeteer).
 *
 * The Puppeteer Browser is owned by index.ts (one shared instance, launched
 * once) and passed in — launching per request would add ~300ms of cold
 * Chromium start to every invoice.
 *
 * Pagination is Puppeteer's: content flows, and `displayHeaderFooter` draws
 * the footer strip ("Made with AstraBill" + page numbers) on every physical
 * page. The page margins leave room for it.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "puppeteer";

import type { RenderRequest } from "./contract.js";
import { TEMPLATES } from "./templates/registry.js";

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

  const html =
    "<!DOCTYPE html>" + renderToStaticMarkup(createElement(Template, req));

  const page = await browser.newPage();
  try {
    // `load` fires after all subresources — once logos are real Cloudinary
    // URLs (Stage 4), this guarantees the <img> has loaded before printing.
    await page.setContent(html, { waitUntil: "load" });
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
