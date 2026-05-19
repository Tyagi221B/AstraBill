/**
 * Render orchestration: RenderRequest → HTML (React SSR) → PDF (Puppeteer).
 *
 * The Puppeteer Browser is owned by index.ts (one shared instance, launched
 * once) and passed in — launching per request would add ~300ms of cold
 * Chromium start to every invoice.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Browser } from "puppeteer";

import type { RenderRequest } from "./contract.js";
import { TEMPLATES } from "./templates/registry.js";

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
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
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
