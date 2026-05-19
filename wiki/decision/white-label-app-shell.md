---
type: decision
updated: 2026-05-19
sources: 0
---

# White-label App Shell — Phase 2D

The gap this phase closes, and the rationale behind the shape of the fix.
Every binding fact lives in `DECISIONS.md` (the "App shell & navigation"
section); this page is the *why*.

## The gap before 2D

Phase 2C made the **invoice** owner-branded: logo, colour, font, template.
The PDF that drops into the customer's WhatsApp now looks like the shop's
invoice, not AstraBill's.

But the app the owner himself uses every day still felt like ours:
- `/dashboard` opened to a card grid of *businesses* — the owner had to
  pick one before any work could start. A multi-tenant admin panel feel.
- Every page header said "AstraBill". The business name lived inside cards,
  three clicks deep.
- Every internal URL carried `?businessId=...`. Active business was a query
  param, not part of the page identity.
- Navigation was hub-and-spoke: bounce back to `/dashboard` between sections.

So even though the OUTPUT (PDF) was the owner's brand, the SHELL was still
clearly someone else's product. That's the gap. The thesis is *"the billing
software Indian SME owners actually use"* — the app has to feel like *theirs*
from the first frame.

## Why path-based business routing

Two ways to encode the active business:

**A. Session-based** — store `activeBusinessId` in the JWT/cookie; URLs stay
flat (`/invoices`, `/customers`); a "switch business" mutates the cookie.

**B. Path-based** — every page lives under `/b/[businessId]/...`; switching
is a `Link` click; URLs are explicit.

Path-based won because:

1. **Bookmarkable.** A path to a specific invoice in a specific business is
   a complete URL. Email someone a `/b/.../invoices/.../edit` link, it works.
   Session-based: the link opens in the *recipient's* active business, which
   is the wrong business.
2. **Two tabs, two businesses.** An owner with three shops switches between
   them across tabs. Session-based makes that impossible — both tabs share
   the cookie, switching in one flips the other.
3. **No session-state surprises.** With path-based, "which business am I in"
   is observable from the URL bar. No hidden state. No "I clicked invoices
   and got the wrong company's data" moment.
4. **How every serious multi-tenant SaaS does it.** Linear, Slack, Notion,
   Vercel, GitHub — all path-based (workspace slug / id as a URL segment).
   Convergent evolution is signal.

The cost is a slightly noisier URL (a UUID segment) and a one-time route
restructure. Both are worth paying.

## Why one layout owns membership

The membership check (`is this user an active member of this business?`) is
the V1 tenant-isolation invariant. It has to run on **every** business-scoped
page. Two ways to satisfy that:

**A.** Every page calls `requireMember(businessId)` itself.
**B.** The shared `/b/[businessId]/layout.tsx` calls it once; nested pages
trust the layout.

(A) duplicates the check across ~15 page files and leaves room for one to
forget. (B) puts the invariant on exactly one line. SSOT.

The repository layer still scopes every read by `business_id` — so a missed
layout check wouldn't compromise data — but the layout is the *early-return*
that gives the user a clean 404 before any service work happens.

## Why 404, not 403

A non-member who hits a valid business's URL gets the same response as a
hit on a random non-existent uuid: `notFound()`. The 403 alternative ("You
are not a member") leaks that the business id is real — useful intel for
anyone enumerating ids hoping to find a target.

The repository layer follows the same pattern (`getBusinessForUser` returns
`null` for both "doesn't exist" and "not a member" — see
[[decision/database-and-rbac]]). The layout just surfaces the null as 404.

## Why subtle branding, not full repaint

Considered: paint the sidebar background in `business.brandColor`. Visually
striking — instantly says "this is your dashboard." Rejected because:

- The picker is `<input type="color">`. Owners will pick saturated reds /
  greens / oranges. A solid-red sidebar reads as an error state; solid green
  reads as a success banner. The same colour that works as an accent fails
  as 30% of the visible UI.
- The contrast budget. Nav items, hover states, the active indicator, and
  the muted text inside the sidebar all need to maintain WCAG contrast
  against the painted bg. With a fixed neutral bg we author once; with a
  user-driven painted bg we'd need a runtime contrast solver.
- The data area beside it. A loud sidebar pulls attention away from the
  invoice the owner is reading. Calm chrome makes the work-area readable.

The shipped strategy (see the *Branded chrome strategy* row in
`DECISIONS.md`) places the brand on small accent surfaces only — leaving the
rest of the chrome neutral. The PDF is where colour goes bold; the app shell
stays calm so the work-area data reads cleanly.

## Why "Powered by AstraBill" stays — even on paid plans

Two cohorts will see this footer:

- Free plan: the PDF footer mark *"Made with AstraBill"* is plan-gated
  ([[decision/invoice-design-system]]), but the **app shell** mark is not.
  It's the only attribution surface inside the product itself.
- Paid plan: still sees it because we never sold removal of the in-app mark.
  That sale was for the *customer-facing* PDF footer.

The visual treatment (size, opacity, placement — see DECISIONS.md) is
sized to be visible to the owner who looks for it and invisible to anyone
glancing at the screen from across a counter.

## Why smart-redirect at `/dashboard`, not a picker

The states an authed user can be in collapse cleanly onto two destinations
(no-business and has-business — see the `/dashboard` row in DECISIONS.md).
There's no fourth state where "show a list" is the right answer. Users who
*genuinely* want to switch businesses do it from the BusinessSwitcher in
the sidebar — once they're already in the app, branded, productive. The
multi-tenant chooser at `/dashboard` was a leftover of phase 2A's early
UX, not a deliberate design.

The V1 heuristic for which business to land in (also in DECISIONS.md) is
the cheapest correct answer — we already track membership creation, so
"most recently joined" is free. The proper answer is *most recently used*,
which costs one `users` column and one write per switch; out of Step 1 to
keep the scope tight, but small enough to add when the user fleet grows
enough that the heuristic starts being wrong often.

## Why `lib/routes.ts` is the SSOT for URL structure

Pages used to template-string paths in JSX:
```tsx
href={`/invoices?businessId=${businessId}`}
```

When the route shape changes, that's a find-and-replace across every link.
With `routes.b(id).invoices`, the same change is one line in `lib/routes.ts`
and TypeScript surfaces every caller. The `b(businessId)` factory style
matters because pages emit *multiple* links for the *same* business (sidebar
emits five) — pulling the factory once is more ergonomic than passing the
id five times.

## Status

| Step | What | Status |
|------|------|--------|
| 1 | Path-based routing scaffold (`/b/[businessId]/` layout + membership check), `BrandedAppShell`, `Sidebar` with BusinessSwitcher, smart `/dashboard` redirect, dashboard placeholder, `lib/routes.ts` | ✅ shipped |
| 2 | Migrate `/invoices`, `/customers`, `/products`, `/settings/branding` under `/b/[businessId]/...`. Until then the sidebar links to the old paths and those pages render without the new shell — a deliberate transitional gap | pending |
| 3 | Real dashboard KPIs (outstanding ₹, paid this month, recent invoices, top customers, low stock) replacing the placeholder cards | pending |
| 4 | Mobile shell — hamburger / drawer for the sidebar; current shell is `md:` and up only | pending |

Step 2 unblocks every later feature (payment recording, WhatsApp send) — those
add buttons/panels to pages whose URL shape should be settled first. The
order is: rebuild the spine (2D), then graft features onto it.

## Related

- [[decision/invoice-design-system]] — the parallel "make it theirs" move on
  the PDF side; sets the precedent
- [[decision/database-and-rbac]] — the membership-check + no-existence-leak
  pattern this layout reuses
- [[decision/frontend-architecture]] — the Tailwind-v4 / token strategy the
  sidebar leans on (the `--sidebar-*` tokens were already in `globals.css`,
  predicting this build)
- [[decision/code-architecture]] — the layering this preserves (page → service
  → repo; layout is page-tier, not a new layer)
