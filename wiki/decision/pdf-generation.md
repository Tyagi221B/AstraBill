---
type: decision
updated: 2026-05-17
sources: 3
---

# PDF Generation — Maximum Control Approach

## Decision: Dedicated PDF microservice with Puppeteer. Not serverless.

The user wants maximum control. That means full CSS, any layout, custom fonts, pixel-perfect output. The only way to get that is a real Chromium running on a real server — not a serverless function.

## Why Not @react-pdf/renderer

`@react-pdf/renderer` is fast (<500ms) and works on Vercel. But:
- Its own styling system (not real CSS) — like React Native StyleSheet
- Limited table layouts — AstraBill invoices have complex tables (multi-unit, HSN, per-line GST)
- Custom fonts work but require manual embedding
- No CSS Grid/Flexbox (the real kind)
- Fighting the tool's limitations = shipping slower

For a simple invoice: fine. For a hardware shop invoice with cutting charges, multi-unit columns, HSN codes, CGST/SGST per line, and custom templates: not enough.

## Why Not Puppeteer on Vercel

- Chromium binary is ~100MB. Vercel's default serverless limit is 50MB. Even with `@sparticuz/chromium-min` you're at the edge.
- Cold starts with headless Chrome on serverless: 3-8 seconds.
- Works but it's fighting the platform. Gets painful.

## The Right Architecture: PDF Microservice

```
Next.js app (Vercel)
     ↓  POST /generate-pdf  { invoiceData: {...} }
PDF Service (Digital Ocean droplet — see [[decision/infrastructure]])
     ↓  renders invoice HTML with Puppeteer
     ↓  uploads via the `IStorageProvider` interface
     ↓  returns the storage URL
Next.js app
     ↓  serves PDF via /i/[invoiceId]/pdf → 302 to storage URL
```

**PDF Service stack:**
- Node.js + Express (or Fastify)
- Puppeteer with full Chromium
- Renders a server-side React/HTML template
- Uploads the bytes through the storage provider (Cloudinary, per
  `DECISIONS.md` → "File storage"); call site is provider-agnostic.

**Why Railway/Render vs a Lambda:**
- Always-on process = no cold starts
- Full Chromium = no binary size hacks
- Simple to deploy: `npm start` + Dockerfile

## The Invoice Template

Invoice is a React component rendered to HTML string (`renderToStaticMarkup`), sent to Puppeteer:

```typescript
// invoice-template.tsx — plain HTML/CSS, no browser JS needed
export function InvoiceTemplate({ invoice }: { invoice: InvoiceData }) {
  return (
    <html>
      <head><style>{invoiceCSS}</style></head>
      <body>
        <BusinessHeader />
        <CustomerSection />
        <LineItemsTable />   {/* multi-unit, cutting charges, etc. */}
        <TaxBreakdown />     {/* CGST, SGST, IGST per line */}
        <TotalSection />
        <PaymentQR />        {/* UPI QR code */}
        <Footer />
      </body>
    </html>
  )
}
```

Puppeteer renders this HTML → `page.pdf({ format: 'A4', printBackground: true })`.

The output is indistinguishable from a professionally printed invoice. Any CSS goes.

## What This Unlocks for Hardware Shop

| Requirement | react-pdf | Puppeteer |
|-------------|-----------|-----------|
| Multi-unit columns (sq.ft., kg, pcs) | ⚠️ Limited | ✅ Full |
| Cutting charges as line item | ✅ | ✅ |
| HSN code column | ✅ | ✅ |
| Per-line CGST/SGST breakdown | ⚠️ Hard | ✅ |
| Custom fonts (any Google Font) | Manual embed | ✅ Auto |
| Business logo/branding | ✅ | ✅ |
| UPI QR code on invoice | Manual | ✅ |
| Multiple invoice templates | ✅ | ✅ |
| Dynamic page count (long invoices) | ✅ | ✅ |
| Devanagari/regional script | Tricky | ✅ |

## PDF URL Strategy (Critical)

The PDF is stored at the file-storage provider (see `DECISIONS.md` → "File
storage"), but **we never put the provider's raw URL into a WhatsApp message
or any customer-facing surface**.

**The problem**: every CDN / storage provider eventually rotates URLs, expires
signed links, or changes their public format. If we hand a contractor a
storage-provider URL today and that URL is dead a year later, the WhatsApp
history goes 404 and we get support tickets we can't fix.

**The fix**: a stable redirect endpoint on our domain.

```
/i/[invoiceId]/pdf
  → checks auth / invoice ownership
  → asks the storage provider for a fresh access URL
  → 302 redirect
```

- WhatsApp message always contains `https://astrabill.com/i/INV-0047/pdf`.
- That URL never expires (it's ours).
- The underlying storage URL can rotate, get signed, get re-signed, switch
  providers — none of it leaks out.
- Bonus: we log every PDF view (who opened it, when).
- Bonus: we can gate access (unpaid invoice → payment prompt instead of PDF).

**Idempotency**: regenerate the PDF only if invoice data has changed (track
`pdf_version` on the invoice row). Same version = serve the existing file.

```
invoice finalized → POST /generate-pdf
     → PDF bytes → IStorageProvider.upload(...)
     → returns storage URL
     → stored on invoice record: invoice.pdf_url
     → send https://astrabill.com/i/.../pdf to WhatsApp (document message)
```

## Invoice Template Versioning

As we add features (new line item types, template customization), old PDFs should not regenerate with new templates. Store `template_version` on each invoice. The PDF service picks the right template renderer based on version.

## Related Pages

- [[decision/whatsapp-meta-api]] — PDF URL gets sent via WhatsApp
- [[customer/hardware-shop-owner]] — the complex invoice requirements driving this choice
- [[decision/payment-gateway]] — UPI QR on invoice from Razorpay
