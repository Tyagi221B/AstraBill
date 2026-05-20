---
type: decision
updated: 2026-05-20
sources: 0
---

# UI Refinement — Phase 2E

A 2–3 day visual-polish pass on the in-app UI. **Not a redesign** — the
information architecture, the routes, the flow stay. We refine the
*look* until it stops feeling amateurish and starts feeling like a
product someone would pay for.

Binding facts (the scope, the new spacing/typography conventions, the
light-default theme switch) live in `DECISIONS.md` and the comment
header in `app/globals.css`. This page is the *why*.

## What triggered it

After Phase 2B shipped on production (full hero loop end-to-end on
`astrabill.com`), the user's reaction was direct: *"I am not liking
the UI. We have to do a lot of refining before we can even think of
launching it. It looks shit right now."* That was paired with a
specific worst-screen call (the invoice creation form) and a
specific aesthetic target (Zoho-like, light, calm, generous spacing).

The build side is in shape — 4 of 4 V1 features live. The polish
side is the gap between "works" and "I'd pay for this."

## The diagnosis

Three forces compound to the "looks amateurish" reaction:

1. **Spacing is ad-hoc.** Every screen picks its own gaps. Some are
   cramped (the invoice line-items table on a dense desktop), some
   are over-spread (the dashboard cards on a 27" screen). No single
   scale ties them together.
2. **The default theme is dark.** It happens to be what the user
   personally prefers, but for a first-time Indian SME owner landing
   on AstraBill, dark feels developer-y. Zoho, Tally, Vyapar, and
   every Indian-accounting product the user's brother has touched is
   light. We were fighting the category expectation.
3. **The token system was right, but the *application* was inconsistent.** Components
   reach for tokens; some reach for raw Tailwind sizes that don't
   tie to anything. The token block is clean — the discipline of
   *which* token / *which* size at *which* spot is the missing piece.

## Why Zoho-like (not Linear / Stripe / Vyapar)

The user has used Zoho. The user's brother has seen Zoho. Indian
accountants overwhelmingly recommend Zoho. "Light, calm, generous
spacing" is the aesthetic vocabulary of professional accounting
software in India.

Linear-style density wins for power-users in tabs they spend hours
in. AstraBill is a 5-minute-tool: open it, finalize an invoice,
send, close. Density rewards repeated use; *calm* rewards the
twice-a-day visitor. We're optimising for the latter.

Vyapar-style colour-and-friendliness is the competitor we want to
beat by being *more* professional, not by matching their warmth. Our
positioning is "Tally for your CA; AstraBill for you" — clean and
trustworthy beats colourful and chatty.

## Why a documented spacing scale (and not just "use your taste")

Solo project. One person writing all the UI. "Use your taste" works
for one screen; falls apart when the user opens screen 5 a week
later and unconsciously picks a different gap. A documented scale is
the lowest-friction enforcement: it lives in the `globals.css`
header comment, the developer sees it every time they open the file,
and the table is small enough to memorise after two uses.

Scale picked:

- **Section gap 32px / `space-y-8`** — the breath between major page
  blocks (headline → cards → table)
- **Intra-section 20px / `space-y-5`** — between cards inside the
  same logical group (e.g. WhatsApp + Payments + Notes)
- **Form-row 16px / `space-y-4`** — between fields in a form
- **Label → input 6px / `space-y-1.5`** — tight inside the field
- **Card padding 20–24px / `p-5` or `p-6`** — generous interior
- **Page padding 24–32px desktop / `px-6 md:px-8`** — enough margin
  for the content to breathe at 1440px

These multiples of 4px are already Tailwind-native; nothing new is
being introduced — the choice is *which* Tailwind value to reach for.

## Why light-default (with dark still available)

The toggle stays. Power-users (including the user) can flip to dark
and the choice persists. But the *first paint* on first visit is
light. Three reasons:

1. **Category match.** Every Indian accounting product the target
   customer has seen is light.
2. **OS default leakage.** `defaultTheme="system"` meant first-time
   users on a dark-OS laptop got dark, which fought (1).
3. **Branding readability.** AstraBill's primary blue
   (`#2563eb`) reads cleaner against white than against `#0a0f1c`.
   The PDF templates are light anyway; consistency from app → PDF
   reinforces "professional document."

## Why **no** new design library

We're not adding shadcn/ui's full kit, not adding Radix beyond what's
already there, not adding a new component library. The primitives
shipped in F3 (Input, Label, Textarea, Card, Badge) are enough.
Polish is *applying them with discipline*, not adding more options.

The one exception: **sonner toast** lands in Step 3. There's no
ephemeral-notification primitive in the app today, and every screen
either ignores the need or hand-rolls inline error/success states.
That's the kind of half-cooked pattern this phase exists to eliminate.

## Why we skip Razorpay until this lands

Razorpay completes the V1 loop. It's tempting to ship it first ("just
finish V1"). But Razorpay introduces *more* UI: a "Pay Now" button on
`/i/[shareToken]`, a webhook-status indicator on the invoice detail
page, possibly a "Payment Link" panel. Adding new UI on top of
unrefined UI doubles the future refinement work.

Refine first, then add. The "Pay Now" button arrives into a polished
visual language and inherits the discipline.

## What's explicitly out of scope

- **Flow changes** — the Mark-as-sent + Send-on-WhatsApp merge we
  discussed earlier today is a separate piece. Polish first, flow
  second.
- **Public `/i/[shareToken]` page** — user confirmed it's OK as-is.
  We don't touch it.
- **PDF templates** — Phase 2C territory.
- **Razorpay** — V1 piece left, but after this.
- **New features.**

## Phasing & exit criteria

**Step 0 — Foundation** *(this commit)*: token audit · spacing scale
documented · light default · this decision page.

**Step 1 — Invoice creation form**: the headline screen. Becomes the
template for the rest. Exit: user opens the create page on
`astrabill.com` and the visceral reaction shifts from "shit" to
"OK, this looks like a product."

**Step 2 — Propagate**: same patterns applied to invoice detail,
dashboard, customers, products, settings. Mostly mechanical.

**Step 3 — Polish pass**: empty states, loading skeletons, sonner
toasts, focus states, mobile spot-checks. The "details that
separate good from acceptable" pass.

After Step 3, this phase is done; we move to Razorpay (V1 piece
left), then the deferred flow-changes discussion, then launch.

## Related Pages

- [[decision/frontend-architecture]] — the tokens and theming
  conventions this builds on
- [[decision/invoice-design-system]] — Phase 2C; PDF templates
  share aesthetic principles with the in-app UI
- [[customer/hardware-shop-owner]] — the user we're refining for
- [[competitor/tally]], [[competitor/vyapar]] — the visual
  competition we're positioning against
