---
name: performance-roadmap
description: The "Zoho-feels-instant" target — patterns we adopt to get there, in four phases. Binding rules live in DECISIONS.md; this page holds the why + the playbook.
type: decision
updated: 2026-05-26
sources: 1
---

# Performance roadmap — "light as hell"

The product target is **Zoho-feels-instant**: chrome paints in under
100ms, navigation is soft (no full reload, layouts stay mounted), back
navigation reads from memory not network, and writes feel free (UI
updates before the server even responds). The Indian SME owner runs
this on a 2G connection in Mathura on a four-year-old phone — the app
must still feel snappy.

Binding rules — which primitive when, what we will never do — live in
`DECISIONS.md` under "Code Architecture":
- *Write surface — dual wrappers*
- *Session helpers — DB-authoritative*
- *Cache primitives — when to use what*

This page is the *playbook*: the four-phase plan that gets us from
where we are to the target, with the why behind each step.

## Why this matters

Three of the four V1 patterns Indian SMEs already love (Vyapar's
mobile-first, Khatabook's instant ledger, myBillBook's clean PDFs) are
*fast*. They feel like extensions of the owner's notebook, not
software. The market lesson — and the [[astrabill-feels-light-like-zoho]]
direction confirmed post-F3 — is that *perceived* speed matters more
than feature count.

Next.js 16 ships nearly every primitive we need for this; we just have
to use them deliberately.

## Where we are vs the target

| Pattern | Today (2026-05-26) | Target |
|---|---|---|
| Static shell / PPR | OFF (`cacheComponents: false` — Next 16 default) | ON, with audit of every page's dynamic-data access |
| `<Link>` prefetching | Mostly used, never audited | Every internal nav uses `Link`; `<a>` only for external |
| Router Cache | Working (Next default), invalidation imprecise | Cache stays fresh — every write `updateTag`s its surface |
| Optimistic UI | None | Top 4-5 write surfaces use `useOptimistic` |
| Loading states | `loading.tsx` shells on dashboard / invoices list / invoice detail | Skeleton on every server-component page that blocks |
| Parallel data fetches | Inconsistent | All layout/page fetches use `Promise.all` where independent |
| DB indexes | Default Drizzle indexes + a few hand-added | Reviewed once we have real traffic |

We're not in a bad place. The infra is here. We just haven't turned
the dials yet.

## Phase 1 — Architecture foundation (shipped 2026-05-26)

Locked in DECISIONS.md. The Account form is the first surface built
on it; every new write surface from here on follows the pattern.

- **Dual wrappers**: every write has a Route Handler (mobile + external
  API) AND a Server Action (web UI), both calling the same service.
- **DB-authoritative session**: `requireUser()` reads display fields
  from `users` on every authed request. The JWT carries `userId` only.
  No cookie-rewrite dance after a profile save — the next render just
  reads the fresh row.
- **Cache primitive matrix**: documented when to use `'use cache'`,
  `cacheTag`, `cacheLife`, `updateTag`, `revalidateTag`, `refresh`.

The Account save bug (sidebar didn't update without sign-out / sign-in)
was the forcing function for this phase. It's fixed now as a side
effect — the architecture was the real fix.

## Phase 2 — Turn on PPR (`cacheComponents: true`)

**The single biggest perf win available to us.**

`cacheComponents: true` in `next.config.ts` enables Partial Prerendering.
Next 16 then:
- Pre-renders the *static shell* of every page at build time (header,
  sidebar layout, page chrome). Painted instantly on every load.
- Refuses to build any page that accesses dynamic data (cookies,
  headers, DB queries) outside `<Suspense>` or `'use cache'`. This
  forces us to be explicit about what's dynamic vs cached.
- Streams the dynamic parts at request time. The user sees the chrome
  immediately, the data fills in over the next ~200ms.

**The cost**: every page needs an audit. Anywhere we currently call
`requireUser()` / `db.query(...)` directly in a server component, we
need to either:
- Wrap that section in `<Suspense fallback={<Skeleton />}>` so the
  static shell can pre-render around it, OR
- Extract the data fetch into a `'use cache'` function (if it's
  cacheable) and tag/expire it.

**Estimated effort**: 1-2 days of careful audit across ~40 pages.

**Acceptance**: every page in `app/b/[businessId]/...` either builds
into a static shell + suspense-streamed dynamic regions, or is
explicitly marked dynamic via `<Suspense fallback={null}>` at the root
(for pages where the whole point is per-user data, like the dashboard).

**Not started.** Should be its own dedicated session.

## Phase 3 — Full Server Action migration + precise cache invalidation

For every existing write surface that's currently a Route Handler
called from a client form:

- Party form (create / update / delete)
- Item form (create / update / delete / adjust stock)
- Document form — every type (sales_invoice / quotation / credit_note /
  purchase_invoice / debit_note / estimate / delivery_challan /
  proforma_invoice)
- Payment record (in / out)
- Business profile (Manage Business)
- Account (already migrated in Phase 1)
- Settings — Invoice Settings (numbering + T&C)
- Settings — Print Settings (branding)
- Money account add / reduce / transfer
- Onboarding wizard steps

Each gets:
1. A colocated `actions.ts` with a Server Action wrapping the existing
   service function (zero changes to service or repo).
2. The corresponding `'use cache'` reader (the *list view*) tagged.
3. The action calls `updateTag(tag)` after writing so the next read
   serves fresh data immediately.
4. The action calls `refresh()` so the client router re-renders with
   the new data.

**The Route Handler stays unchanged** — mobile app + external
integrations call it. Future mobile builds get a stable HTTP contract
with no breaking changes from this work.

**Estimated effort**: ~half a day per surface × ~10 surfaces.
Bundleable into 2-3 sessions.

**Acceptance**: every write surface uses a Server Action; every list
view that surface touches has `'use cache'` + `cacheTag` + an
`updateTag` call wiring them together. Manual smoke: save → list
shows new row instantly, no page reload.

**Not started.** Should be its own dedicated session(s) after Phase 2.

## Phase 4 — Optimistic UI on hot write paths

For the top write surfaces (the ones owners hit dozens of times a
day), wire React 19's `useOptimistic`:

- Save invoice → form immediately shows "Saved ✓", row appears in the
  list, totals update — *before* the server responds
- Record payment → outstanding ₹ on the dashboard immediately drops
- Save party → party appears in the picker dropdown immediately

On the rare server-side failure, the optimistic state rolls back and
a toast surfaces the error. For the success case (99%+ of writes),
the user never sees "Saving…".

**The order**: top 5 write surfaces, ranked by daily frequency. Don't
optimistic-update operations that are rare or where the user expects
a clear confirmation (settings saves, sign-out — these can stay
explicit).

**Estimated effort**: ~2 hours per surface × ~5 surfaces.

**Not started.** Should be its own session after Phase 3.

## Ongoing — performance budget

After Phase 2-4 ship, set hard per-page budgets:
- **LCP** (Largest Contentful Paint) < 1.0s on 4G
- **INP** (Interaction to Next Paint) < 200ms
- **CLS** (Cumulative Layout Shift) < 0.05

Anything that misses gets investigated, not just shrugged off. The
"Zoho-feels-instant" target is enforced, not aspirational.

## What we won't do

- **`cacheComponents: true` without auditing every page first.** It
  breaks every page that accesses dynamic data outside `<Suspense>`
  or `'use cache'` — the build *refuses to compile*. Flipping it
  carelessly = ship-blocker.
- **Speculative `'use cache'`.** Every `'use cache'` we add gets a
  measured justification: which hot path, what the read cost is,
  why caching beats the freshness tradeoff. No "might as well cache it".
- **`'use cache: private'`** until it leaves experimental. The
  cookie/headers caching primitive is exactly what we'd want for
  per-user cached data, but stabilising in v16 it's not yet — revisit
  in v17 or whenever it ships stable.
- **Optimistic UI on settings + auth.** These are infrequent, the
  user expects an explicit confirmation, and a wrong optimistic
  result is more confusing than helpful.

## Related

- [[decision/code-architecture]] — the layering this builds on
  (service is the truth; routes + actions are thin wrappers)
- [[decision/frontend-architecture]] — the Tailwind + token system
  that keeps the skeletons / loading states visually coherent
- [[astrabill-feels-light-like-zoho]] — the UX direction this is
  built to deliver
