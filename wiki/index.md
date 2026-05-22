# AstraBill Wiki Index

> **Binding decisions live in [`DECISIONS.md`](../DECISIONS.md)** (repo root) — the single
> source of truth. Read it first in any building session. The `decision/*.md` pages below
> hold rationale only; they do not restate facts.

| Page | Type | Summary |
|------|------|---------|
| [overview.md](overview.md) | synthesis | Rolling thesis: what AstraBill is, who it's for, current best bets |
| [log.md](log.md) | log | Chronological record of all wiki operations |
| **Decisions** | | |
| [decision/market-validation.md](decision/market-validation.md) | decision | Is AstraBill worth building? Yes. Full case with market size, risks, timing |
| [decision/upi-deep-links.md](decision/upi-deep-links.md) | decision | **V1 payments** — UPI deep links to the shop's own VPA; manual reconciliation via existing `Record payment` flow. No gateway, no webhook, no provider abstraction. |
| [decision/payment-gateway.md](decision/payment-gateway.md) | decision | _(Superseded for V1)_ Razorpay reasoning, kept as background for the V1.x reintroduction. |
| [decision/onboarding-flow.md](decision/onboarding-flow.md) | decision | No signup first → phone OTP → paid. Feature gating at service layer. |
| [decision/drafts-and-multi-device.md](decision/drafts-and-multi-device.md) | decision | Drafts = `documents.status='draft'` rows; localStorage only for the pre-auth window. Multi-device + AI features fall out for free. |
| [decision/pdf-generation.md](decision/pdf-generation.md) | decision | Dedicated PDF microservice with Puppeteer. Not serverless. Maximum control. |
| [decision/whatsapp-meta-api.md](decision/whatsapp-meta-api.md) | decision | Use existing Opryon Labs WABA. Same creds for testing, new phone number for prod. |
| [decision/infrastructure.md](decision/infrastructure.md) | decision | Vercel (Next.js) + Digital Ocean (PDF + cron worker) + Supabase + Razorpay |
| [decision/database-and-rbac.md](decision/database-and-rbac.md) | decision | PostgreSQL + Drizzle ORM. Multi-business from day 1. RBAC in TypeScript not SQL. |
| [decision/auth-strategy.md](decision/auth-strategy.md) | decision | NextAuth v5 + JWT sessions. Two equal entry doors: Google OAuth + WhatsApp OTP. Never Supabase Auth. |
| [decision/code-architecture.md](decision/code-architecture.md) | decision | LLD: thin routes → service → repo → DB. Interfaces for externals. Typed errors. |
| [decision/v1-scope.md](decision/v1-scope.md) | decision | **SUPERSEDED** by `decision/full-ledger-pivot`. Kept as historical context (the original billing-loop framing) + the WhatsApp sender-identity rationale that carries forward. |
| [decision/phase-2-plan.md](decision/phase-2-plan.md) | decision | 2A + 2C + 2D (white-label shell, all 4 steps) + payment recording + udhaar all shipped; 2B (WhatsApp hero loop) next once Meta + Razorpay verifications clear. |
| [decision/full-ledger-pivot.md](decision/full-ledger-pivot.md) | decision | **(2026-05-21)** AstraBill = full GST books, not billing loop. Parties (cust+supp), Sales+Purchases, Ledger, ITC. Supersedes `decision/v1-scope`. |
| [decision/frontend-architecture.md](decision/frontend-architecture.md) | decision | Tailwind v4 + CSS-variable theming (light/dark via next-themes); marketing site as a route group; shadcn adopted in F3. |
| [decision/invoice-design-system.md](decision/invoice-design-system.md) | decision | Phase 2C: template engine + brand customization (logo, color, font, columns). Lands *before* 2B — no external blockers, and 2B's hero artifact is the PDF this work makes worth sending. |
| [decision/white-label-app-shell.md](decision/white-label-app-shell.md) | decision | Phase 2D: path-based `/b/[businessId]/...` routing, branded sidebar, smart `/dashboard` redirect. Makes the app feel like the owner's billing dashboard, the parallel of 2C on the chrome side. |
| [decision/payment-recording.md](decision/payment-recording.md) | decision | Manual payment recording: `amount_paid` derived from payment rows, status follows the sum, void = soft delete. The keystone the dashboard KPIs + udhaar view depend on. |
| [decision/public-invoice-share.md](decision/public-invoice-share.md) | decision | Customer-facing `/i/[shareToken]` view + PDF download. 16-char token IS the auth; URL locked by the Meta-approved template button. The infra the 2B WhatsApp send plugs into. |
| [decision/whatsapp-invoice-send.md](decision/whatsapp-invoice-send.md) | decision | Phase 2B hero loop — "Send on WhatsApp" on a finalised invoice. Template binding in one service, immutable send history, lazy share_token backfill, transport-layer sanitisation. |
| [decision/ui-refinement-phase-2e.md](decision/ui-refinement-phase-2e.md) | decision | Phase 2E: 2–3 day visual-polish pass. Zoho-like, light-default, documented spacing/typography scale. Invoice creation form is the headline; patterns propagate. No flow changes, no new features. |
| **Competitors** | | |
| [competitor/tally.md](competitor/tally.md) | competitor | The 30-year incumbent. Desktop-only, 70-90% MSME share, steep learning curve, ₹22,500+ |
| [competitor/vyapar.md](competitor/vyapar.md) | competitor | Mobile challenger, 1Cr users, broken WhatsApp, serious RBAC privacy hole |
| [competitor/khatabook.md](competitor/khatabook.md) | competitor | Digital ledger leader, 50M downloads, declining headcount, weak billing product |
| [competitor/zoho-books.md](competitor/zoho-books.md) | competitor | Best cloud accounting, but complex setup — for accountants not owners |
| [competitor/refrens.md](competitor/refrens.md) | competitor | Best ratings (4.8★), WhatsApp-first, freelancer-focused — not our segment |
| [competitor/odoo.md](competitor/odoo.md) | competitor | ERP for growing businesses. Too heavy for SMEs, but shows graduation path |
| [competitor/mybillbook.md](competitor/mybillbook.md) | competitor | FloBiz-backed direct peer. "1 Crore+ businesses" claim. Leads with brand-customizable invoices — the gap AstraBill closes in 2C. |
| [competitor/mybillbook-architecture.md](competitor/mybillbook-architecture.md) | competitor | **Architecture teardown** — sidebar, Create Party fields, doc taxonomy. The blueprint AstraBill copies under `decision/full-ledger-pivot`. |
| **Customers** | | |
| [customer/hardware-shop-owner.md](customer/hardware-shop-owner.md) | customer | Glass/hardware shop: multi-unit billing, udhaar tracking, kacha/pakka reality |
| **Concepts** | | |
| [concept/india-sme-market.md](concept/india-sme-market.md) | concept | 63M MSMEs, 30M digital, cash flow crisis, Tier 2/3 wave |
| [concept/whatsapp-billing-opportunity.md](concept/whatsapp-billing-opportunity.md) | concept | The biggest wedge: 98% open rate, ₹0.14/invoice, UPI payment link workflow |
| [concept/gst-compliance.md](concept/gst-compliance.md) | concept | The mandatory hook: GST forces software adoption, CA dependency problem |
| [concept/pricing-model.md](concept/pricing-model.md) | concept | Pricing analysis: ₹499/₹999/₹1,999/month, annual preferred |
| [concept/ai-on-invoices.md](concept/ai-on-invoices.md) | concept | The V2 wedge: highlight, suggest, rewrite, customer-history, voice-in. None changes V1 architecture; all compose on the existing data layer. |
