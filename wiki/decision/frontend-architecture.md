---
type: decision
updated: 2026-05-19
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
marketing landing. The signed-in entry point is `/dashboard`; Phase 2D
made that a smart redirect into the active business's branded dashboard
(see [[decision/white-label-app-shell]]).

Initially the app pages (`invoices`, `customers`, `products`, `onboarding`)
were left in place on inline styles. F3 finished the migration: every authed
page now sits inside `AppShell` and renders via the shadcn primitives below.
Pages still live at their original paths — no `(app)` route group needed,
because `AppShell` is a component, not a layout.

## Components

`components/ui` — primitives. `Container`, `Logo`, `Button`, `ThemeToggle`
predate F3; F3 added `input`, `label`, `textarea`, `card`, `badge`.
`components/marketing` — Header, Footer, and the landing sections (Hero,
FeatureGrid, HowItWorks, Pricing, CtaBand, LegalShell). `components/theme` —
the provider + toggle. `components/app` — authed-app chrome (`AppShell`,
`SignOutButton`).

The marketing components stay hand-rolled Tailwind. For static marketing
sections Radix-backed primitives earn nothing — and the existing `Button`
+ `buttonClasses()` API has ~10 call sites across Hero/Header/Pricing/
CtaBand/dashboard that the shadcn CLI would have churned into a different
variant/size scheme.

## shadcn/ui — adopted in F3 with a non-destructive merge

`npx shadcn@latest init` is the canonical setup path, so we ran it: it
writes `components.json`, `lib/utils.ts` with `cn()` (clsx + tailwind-merge),
and installs the helper deps. The radix-nova *preset* that the new CLI
defaults to is more opinionated than the install — it rewrote `Button.tsx`
with dense `h-7`/`h-8`/`h-9` sizes (would have shrunk every marketing CTA),
clobbered the brand-blue `--primary` token with a grayscale OKLCH, and
injected a duplicate Geist font import. We kept the genuinely scalable
pieces (expanded token set: `--popover`, `--secondary`, `--chart-*`,
`--sidebar-*`, full radius scale → future Dialog/Sheet/Sidebar drop in
without touching `globals.css`) and reverted the destructive parts. The
existing `Button` keeps its `primary`/`secondary`/`outline`/`ghost`
variants and `sm`/`md`/`lg` sizes; `components.json` is `style: new-york`,
`baseColor: slate`.

Form primitives are **hand-rolled in shadcn v4 shape** — `data-slot`
attributes, no `forwardRef` (React 19's prop.ref handles it), classes
composed via `cn()`. They match the file structure the CLI would have
produced, so `npx shadcn@latest add dialog`, `add dropdown-menu`, `add sheet`
etc. land alongside them with no manual cleanup. The `Badge` is
`class-variance-authority`-backed with a `tone` variant (`neutral` / `info` /
`success` / `warning` / `destructive` / `primary` / `outline`) that the
invoice status pills consume directly.

## AppShell — and the 2D split

`components/app/AppShell.tsx` was the chrome every authed page sat inside
after F3 — sticky header (Logo, breadcrumbs, ThemeToggle, SignOut),
`Container`-bounded body. Server component; pages still owned their
`requireUser()` gate. Each page passed `crumbs={[{label, href?}, …]}`
instead of inlining a back-link.

Phase 2D split this in two:

- **`AppShell`** stays for legacy authed pages that aren't business-scoped
  (and as a transitional chrome for the 2A-era pages still on
  `/invoices`, `/customers`, `/products`, `/settings/branding` until
  Step 2 of 2D migrates them).
- **`BrandedAppShell`** is the new chrome for every page under
  `/b/[businessId]/...` — sidebar + business identity at the top + the
  data area on the right. Rationale (path-based routing, layout-owned
  membership check, subtle branding strategy, "Powered by AstraBill"
  placement) lives in [[decision/white-label-app-shell]].

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
