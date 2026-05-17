# AstraBill Wiki Log

Append-only. Format: `## [YYYY-MM-DD] <operation> | <title>`

---

## [2026-05-17] init | Wiki initialized

Wiki structure created. AstraBill defined as billing software for SMEs. Market research phase begins.

## [2026-05-17] ingest | Market research pass 1 — India SME billing landscape

Sources ingested: India accounting software market reports, Tally pricing, Vyapar/KhataBook/Zoho/Refrens/Odoo competitor analysis, WhatsApp API pricing, GST compliance landscape, Razorpay Fix My Itch, UPI payment data, India MSME cash flow crisis data.

Pages created/updated:
- overview.md (thesis formed)
- index.md (full catalog)
- concept/india-sme-market.md
- concept/whatsapp-billing-opportunity.md
- concept/gst-compliance.md
- concept/pricing-model.md
- competitor/tally.md
- competitor/vyapar.md
- competitor/khatabook.md
- competitor/zoho-books.md
- competitor/refrens.md
- competitor/odoo.md
- decision/market-validation.md

Key findings: Market validated. Tally's learning curve confirmed (10x real cost). Vyapar's broken WhatsApp = wedge. RBAC gap = wedge. Marketing identified as the real moat, not product.

## [2026-05-17] ingest | Customer discovery — brother's glass/hardware shop + kacha/pakka insight

First customer profiled: glass + hardware shop owner. Key revelations:
- Multi-unit billing required (sq.ft., kg, linear ft.)
- Udhaar (contractor credit) tracking = the daily-use driver, not invoicing
- Kacha/pakka dual books = mainstream practice in Indian trading businesses
- Legal positioning: call it "estimates + cash receipts", never "kacha accounts"
- Competitors in this space (HisabKitab, BUSY, Marg ERP) exist but all have old UX and no WhatsApp

Pages created: customer/hardware-shop-owner.md

## [2026-05-17] lint | First full lint pass — fixed 9 contradictions, added DECISIONS.md

Opus 4.7 review found the wiki self-contradicting in 9 places (all in decision
content): Supabase Auth vs NextAuth in 3 pages, OTP-in-DB vs Redis, SMS vs WhatsApp
OTP, otp_codes table that shouldn't exist, free-tier 10 vs 20 invoices, "service
businesses first" vs trading-shop pivot in 2 pages, an orphan [[link]], and an
internal job-architecture contradiction.

Root cause: decisions were duplicated across pages; an LLM appends but does not
reconcile. Fix: created DECISIONS.md as single source of truth for all binding
facts. Decision pages now hold rationale only and link instead of restating.
Added SSOT + lint-before-commit rules to CLAUDE.md.
