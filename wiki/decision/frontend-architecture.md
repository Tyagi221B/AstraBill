---
type: decision
updated: 2026-05-18
sources: 0
---

# Frontend Architecture — styling, theming, site structure

Rationale for the frontend foundation. Binding facts live in `DECISIONS.md`
(Styling, Theming, Site structure rows); this page is the *why*.

## Why Tailwind v4, not inline styles

Phase 1 + 2A shipped with inline `React.CSSProperties` on every page. That
was fine for proving the data layer, but it has a hard ceiling: **you cannot
theme inline styles**. A JS style object can't express a `dark:` variant —
dark mode with inline styles means branching every colour in every component
on a theme value threaded through props. Tailwind v4 + CSS-variable tokens
makes light/dark a single block of CSS, not a refactor.

Tailwind v4 specifically (over v3): it configures in CSS (`@theme`, no
`tailwind.config.js`), installs as one PostCSS plugin, and builds far faster.
The token system — semantic names (`background`, `foreground`, `primary`,
`muted`, `border`…) mapped from CSS custom properties — means re-theming or
adding a brand is one `:root` / `.dark` block, never a find-and-replace.

## Why next-themes, class strategy

`next-themes` with `attribute="class"` toggles `.dark` on `<html>`, which the
`@custom-variant dark` rule in `globals.css` keys off. It handles the SSR
no-flash problem and persists the user's choice; default is `system`. The
theme toggle is the only client component the theming needs.

## Why route groups — marketing vs app

The public marketing site (landing, legal, contact, and the blog later) needs
a Header + Footer; the authed app pages must never inherit that chrome. Next's
**route groups** are the mechanism: `app/(marketing)/` has its own layout with
Header/Footer; the app pages sit outside it. Route groups are URL-invisible —
`/invoices` stays `/invoices`, `proxy.ts` matchers are unaffected.

The root `app/layout.tsx` is reduced to what is genuinely global: `<html>` /
`<body>`, fonts, the theme provider, and PostHog identify. `/` is the
marketing landing; the signed-in dashboard moved to `/dashboard` (a page can
only own one route, and the landing must be `/` for SEO).

The app pages (`invoices`, `customers`, `products`, `onboarding`) were **left
in place**, not moved into an `(app)` group. Route groups are optional — those
pages already render their own chrome and use the root layout fine. They move
into `(app)/` when they get a shared app shell and are migrated off inline
styles (a later pass), not before.

## Components

`components/ui` — primitives (Container, Button, Logo, theme toggle).
`components/marketing` — Header, Footer, and the landing sections (Hero,
FeatureGrid, HowItWorks, Pricing, CtaBand, LegalShell). `components/theme` —
the provider + toggle. `components/app` — authed-app chrome.

The marketing components are **hand-rolled Tailwind**, not shadcn/ui. For
static marketing sections, Radix-backed components earn nothing — the token
foundation here is already shadcn-shaped (identical CSS-variable pattern), so
adopting shadcn later is friction-free. The plan: bring shadcn/ui in for the
**app** pass, where its accessible Input / Select / Dialog / Table / Form
primitives genuinely save work — not on the landing page.

## SEO

`lib/seo.ts` is the one place that knows the site's identity (`metadataBase`,
name, description) and builds `Metadata` with Open Graph / Twitter defaults.
`app/robots.ts` and `app/sitemap.ts` are Next file conventions; the landing
page embeds an Organization JSON-LD block. Per-page `metadata` everywhere.

## Legal pages

`/privacy`, `/terms`, `/refund`, `/contact` ship as real pages (Razorpay's
website verification expects them). The content is a reasonable first draft
with an effective date — it needs a proper legal review before it can be
considered binding, and the registered-address detail is still a placeholder.

## Related Pages

- [[decision/infrastructure]] — hosting, PostHog, the env surface
- [[decision/code-architecture]] — the route → service → repo layering
- [[decision/phase-2-plan]] — the product build track running alongside this
