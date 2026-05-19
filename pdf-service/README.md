# astrabill-pdf-service

Invoice PDF renderer. Express + Puppeteer + React SSR. Deploys to Digital
Ocean, separate from the Next.js app — the app calls it over HTTP via
`PDF_SERVICE_URL`.

Phase 2C, Stage 1. See `wiki/decision/invoice-design-system.md`.

## How it works

```
RenderRequest (JSON)  →  React template → HTML string  →  Puppeteer → PDF bytes
```

The service is a **dumb renderer**: it receives a fully-derived payload
(HSN summary, amount-in-words, taxClass already computed by the Next.js
side) and never touches a database. The payload shape is the contract at
`src/contract.ts` — a deliberate mirror of `lib/pdf/contract.ts` on the
Next.js side, so the service builds and deploys self-contained. Edit both
when the contract changes (they always change together).

## Routes

| Method | Path      | Body            | Response             |
|--------|-----------|-----------------|----------------------|
| GET    | `/health` | —               | `{ ok: true }`       |
| POST   | `/render` | `RenderRequest` | `application/pdf`     |

`/render` also returns an `X-Render-Ms` header.

## Local development

```bash
cd pdf-service
npm install          # downloads Chromium for Puppeteer (~170MB, once)
npm run dev          # tsx watch, :4000
```

Smoke test with a fixture (from the repo root, dev server running):

```bash
node --input-type=module -e '
  import { fixtureMedium } from "./lib/pdf/fixtures.ts";
  const r = await fetch("http://localhost:4000/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fixtureMedium),
  });
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/invoice.pdf", Buffer.from(await r.arrayBuffer()));
  console.log("wrote /tmp/invoice.pdf", r.status);
'
```

## Deploy (Digital Ocean)

Self-contained — build context is `pdf-service/`:

```bash
docker build -t astrabill-pdf-service pdf-service/
```

Runs on `:4000`. Front it with the droplet's nginx for TLS; the Next.js
app reaches it via `PDF_SERVICE_URL`.

## Templates

`src/templates/registry.ts` maps a `TemplateId` to a React component.
V1 ships `modern` (default) and `classic`; until Stage 7 builds the real
Classic, `classic` aliases Modern.
