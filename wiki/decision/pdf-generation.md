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
PDF Service (Railway / Render / Hetzner VPS)
     ↓  renders invoice HTML with Puppeteer
     ↓  returns PDF buffer (or uploads to Supabase Storage)
Next.js app
     ↓  serves PDF to user / sends to WhatsApp
```

**PDF Service stack:**
- Node.js + Express (or Fastify)
- Puppeteer with full Chromium
- Renders a server-side React/HTML template
- Returns PDF as buffer or uploads to Supabase Storage → returns URL
- Hosted on Railway (~$5/month) or a Hetzner VPS (~€3.29/month)

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

## PDF Storage + URL Strategy (Critical)

PDF generated → uploaded to **Supabase Storage** → but we NEVER expose the raw Supabase URL externally.

**The problem**: Supabase signed URLs expire. If we put a signed URL in a WhatsApp message, it breaks after 7 days. The contractor clicks the link a week later → 403 error → support ticket.

**The fix**: A redirect endpoint on our Next.js app:
```
/i/[invoiceId]/pdf  →  checks auth/invoice ownership  →  regenerates fresh signed URL  →  302 redirect to PDF
```

- WhatsApp message always contains `https://astrabill.com/i/INV-0047/pdf`
- That URL never expires (it's our domain)
- The underlying Supabase URL regenerates on each click (5-minute expiry is fine)
- Bonus: we log every PDF view (who opened it, when)
- Bonus: we can gate access (unpaid invoice = show payment prompt instead of PDF)

**Idempotency**: Only regenerate the PDF if invoice data has changed (track `pdf_version` on invoice). Same version = serve existing file.

```
invoice finalized → POST /generate-pdf
     → PDF bytes → upload to Supabase Storage
     → return: { pdfUrl: "https://xxx.supabase.co/storage/v1/..." }
     → stored on invoice record: invoice.pdf_url
     → send pdfUrl to WhatsApp via Meta API (document message)
```

## Invoice Template Versioning

As we add features (new line item types, template customization), old PDFs should not regenerate with new templates. Store `template_version` on each invoice. The PDF service picks the right template renderer based on version.

## Related Pages

- [[decision/whatsapp-meta-api]] — PDF URL gets sent via WhatsApp
- [[customer/hardware-shop-owner]] — the complex invoice requirements driving this choice
- [[decision/payment-gateway]] — UPI QR on invoice from Razorpay
