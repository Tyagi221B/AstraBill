---
type: decision
updated: 2026-05-17
sources: 2
---

# WhatsApp Meta API Setup — AstraBill

## Context

The user already has a live Meta Business Account (Opryon Labs), verified with GST, running TheGympilot's WhatsApp integration. AstraBill will live under the same account.

## How Meta's WABA Structure Works

```
Meta Business Account (Opryon Labs — GST verified, already approved)
     └── WABA (WhatsApp Business Account)
           ├── Phone Number 1: "TheGympilot" — existing, live
           └── Phone Number 2: "AstraBill" — new, add when ready
```

Each phone number:
- Has its own display name (shows in WhatsApp chat header)
- Has its own profile pic, about text
- Shares the same WABA/Business verification → no re-verification needed
- Has its own set of approved message templates

## Testing Phase (Right Now)

**Use the same phone number ID as TheGympilot.** No setup needed. Just:

1. Create new message templates in the same WABA, prefixed `astrabill_`:
   - `astrabill_invoice_v1` — send invoice with PDF + payment link
   - `astrabill_payment_reminder_v1` — reminder for unpaid invoice
   - `astrabill_payment_received_v1` — receipt after payment
   - `astrabill_estimate_v1` — send quotation

2. Templates use the same approval process (utility category = 24-72 hours)

3. All test messages go from TheGympilot's number — fine for dev/testing. Users will see "TheGympilot by Opryon Labs" as the sender. Acceptable for internal testing.

**Testing in code:**
```typescript
// Same credentials, same phoneNumberId for now
const WHATSAPP_CONFIG = {
  phoneNumberId: process.env.GYMPILOT_PHONE_NUMBER_ID,  // reuse for now
  accessToken: process.env.META_ACCESS_TOKEN,
  apiVersion: 'v20.0'
}
```

## Production Phase (When Ready to Launch)

1. Buy/port a new SIM/phone number for AstraBill
2. In Meta Business Suite → WhatsApp → Add Phone Number
3. Verify the number (OTP to that phone)
4. Set display name: **"AstraBill"** (Meta reviews and approves display names, 1-3 days)
5. Set profile: logo, about text, business category (Business Services)
6. The business verification is ALREADY DONE (Opryon Labs GST on file)
7. Update env: `ASTRABILL_PHONE_NUMBER_ID=xxx`

The "by Opryon Labs" shows only in the extended business info view — not in the main chat header. Main chat shows "AstraBill". Fine for most users.

## Message Templates We Need

### 1. Invoice Template (`astrabill_invoice_v1`)
**Category:** Utility (₹0.14/message)
```
Header: Document (PDF attachment — the invoice PDF from Supabase)
Body:
"Hi {{1}}, 

Your invoice from {{2}} is ready.

Invoice #: {{3}}
Amount: ₹{{4}}
Due Date: {{5}}

Pay now: {{6}}"

Button: [Pay Now] → {{6}} (payment link)
```

### 2. Payment Reminder (`astrabill_reminder_v1`)
**Category:** Utility (₹0.14/message)
```
Body:
"Hi {{1}},

Friendly reminder — Invoice #{{2}} for ₹{{3}} from {{4}} is due {{5}}.

Pay here: {{6}}"

Button: [Pay Now] → {{6}}
```

### 3. Payment Received (`astrabill_receipt_v1`)
**Category:** Utility
```
Header: Image (optional — receipt graphic)
Body:
"Payment received! ✓

₹{{1}} received from {{2}}
Invoice #{{3}} — PAID
Thank you!"
```

### 4. Estimate/Quotation (`astrabill_estimate_v1`)
**Category:** Utility
```
Header: Document (PDF)
Body:
"Hi {{1}},

Here's your estimate from {{2}}.

Estimate #: {{3}}
Total: ₹{{4}}
Valid till: {{5}}

Reply to confirm."
```

## Meta API: Sending a Document (Invoice PDF)

```typescript
await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messaging_product: 'whatsapp',
    to: customerPhone,  // "919876543210" format (no +)
    type: 'template',
    template: {
      name: 'astrabill_invoice_v1',
      language: { code: 'en' },
      components: [
        {
          type: 'header',
          parameters: [{
            type: 'document',
            document: {
              link: invoice.pdf_url,  // Supabase signed URL
              filename: `Invoice-${invoice.number}.pdf`
            }
          }]
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customer.name },
            { type: 'text', text: business.name },
            { type: 'text', text: invoice.number },
            { type: 'text', text: invoice.total.toString() },
            { type: 'text', text: invoice.dueDate },
            { type: 'text', text: invoice.paymentLink }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: 0,
          parameters: [{ type: 'text', text: invoice.paymentLink }]
        }
      ]
    }
  })
})
```

## Webhook Setup

Meta sends payment/message events to our webhook:
```
POST https://astrabill.com/api/webhooks/whatsapp
```

Events we care about:
- `message.delivered` — invoice delivered to customer's WhatsApp
- `message.read` — customer read it (show "Seen" in udhaar tracker)
- `message` (incoming) — customer replied "ok", "done" etc.

The **read receipt** in udhaar tracker is gold — shop owner can see "Ramesh saw the invoice 2 hours ago" = follow up call if still unpaid.

## Rate Limits

- Template messages (utility): no hard per-second limit, but avoid bursts >80/sec
- For payment reminder batches (e.g., 50 overdue customers): send 1 message every 200ms (5/sec) to be safe

## Related Pages

- [[decision/pdf-generation]] — PDF URL that goes into the WhatsApp document message
- [[concept/whatsapp-billing-opportunity]] — the business case
- [[decision/payment-gateway]] — payment link that goes into WhatsApp template
