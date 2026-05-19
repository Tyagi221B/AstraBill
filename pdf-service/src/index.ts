/**
 * astrabill-pdf-service — Express entrypoint.
 *
 * Routes:
 *   GET  /health  → liveness probe
 *   POST /render  → RenderRequest JSON in, application/pdf bytes out
 *
 * One Puppeteer Browser is launched lazily on the first render and reused.
 * The Next.js app calls this service via PDF_SERVICE_URL; it never renders
 * PDFs in-process (DECISIONS — Puppeteer microservice, not serverless).
 */
import express from "express";
import puppeteer, { type Browser } from "puppeteer";

import type { RenderRequest } from "./contract.js";
import { renderInvoicePdf, RenderError } from "./render.js";

const PORT = Number(process.env.PORT ?? 4000);

// ---- shared browser ----------------------------------------------------

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      // --no-sandbox: required running as root in the container.
      // --disable-dev-shm-usage: /dev/shm is small on most droplets;
      // without this Chromium crashes on larger pages.
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

// ---- app ---------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "astrabill-pdf-service" });
});

app.post("/render", async (req, res) => {
  const body = req.body as Partial<RenderRequest> | undefined;
  if (!body?.invoice || !body?.branding) {
    res
      .status(400)
      .json({ error: "Body must include both `invoice` and `branding`." });
    return;
  }

  const startedAt = Date.now();
  try {
    const browser = await getBrowser();
    const pdf = await renderInvoicePdf(body as RenderRequest, browser);
    res.status(200);
    res.type("application/pdf");
    res.setHeader("X-Render-Ms", String(Date.now() - startedAt));
    res.send(pdf);
  } catch (err) {
    const status = err instanceof RenderError ? err.status : 500;
    const message = err instanceof Error ? err.message : "render failed";
    if (status >= 500) console.error("[render] failed:", message);
    res.status(status).json({ error: message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`astrabill-pdf-service listening on :${PORT}`);
});

// ---- graceful shutdown -------------------------------------------------

async function shutdown(signal: string) {
  console.log(`[${signal}] shutting down…`);
  server.close();
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
