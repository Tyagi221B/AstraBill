# AstraBill Wiki Schema

AstraBill is a billing software product being built for SMEs. This file is the schema that governs how the LLM wiki is maintained for this project. It covers market research, product decisions, competitor analysis, customer insights, and strategy.

## Directory layout

```
/raw/          — immutable source documents (articles, interviews, reports, screenshots). Never modify these.
/raw/assets/   — locally downloaded images referenced by raw sources
/wiki/         — LLM-maintained knowledge base (markdown pages). Only Claude writes here.
CLAUDE.md      — this file (schema + workflow instructions)
wiki/index.md  — catalog of all wiki pages with one-line summaries
wiki/log.md    — append-only chronological record of all wiki operations
```

## Wiki page types

- **competitor/<name>.md** — analysis of a competing product
- **customer/<segment>.md** — customer segment profile, pain points, jobs-to-be-done
- **concept/<topic>.md** — market concepts, regulatory landscape, pricing models, etc.
- **decision/<topic>.md** — product/strategy decisions made, with rationale and trade-offs
- **overview.md** — the rolling synthesis: where we are, what we know, what the thesis is

## Ingest workflow

When the user drops a new source (article, interview, competitor teardown, etc.):
1. Read the source
2. Discuss key takeaways with user
3. Write or update relevant wiki pages (competitor, customer, concept pages)
4. Update `wiki/index.md`
5. Append an entry to `wiki/log.md` with format: `## [YYYY-MM-DD] ingest | <source title>`
6. Update `wiki/overview.md` if the source shifts the synthesis

## Query workflow

When the user asks a question:
1. Read `wiki/index.md` to identify relevant pages
2. Read those pages
3. Synthesize an answer with citations to wiki pages
4. If the answer is valuable (a comparison, analysis, decision), file it back as a new wiki page and update the index

## Lint workflow

When asked to lint:
- Look for contradictions between pages
- Stale claims superseded by newer sources
- Orphan pages with no inbound links
- Missing cross-references
- Gaps that a web search could fill

## Conventions

- Every wiki page gets YAML frontmatter: `type`, `updated`, `sources` (count of sources that touched this page)
- Cross-link liberally with `[[page-name]]` style links
- Keep page titles short and specific
- Log every ingest, query-filed, and lint pass in log.md
- The user is building for **SMEs** — always keep that lens. Enterprise features are out of scope unless explicitly discussed.

## Model Guide

Two rules. No system needed beyond this:

**Use Sonnet 4.6** (default) for:
- Writing code (components, API routes, services, schema, tests)
- Debugging specific errors
- Research, web searches, wiki updates
- Anything where speed matters more than depth

**Escalate to Opus 4.7** when:
- Reviewing a full system for architectural issues ("does this schema make sense end to end?")
- A bug or design problem has you stuck after 2 attempts
- Writing security-critical code (auth, RBAC, payment webhooks)
- A decision is hard to reverse and has large consequences

Default is Sonnet. Opus is the escalation path, not the default. If unsure, stay on Sonnet.

## Resuming a session

**Research / wiki sessions:**
> "Read wiki/index.md and wiki/overview.md — continuing AstraBill"

**Building sessions (code, schema, architecture):**
> "Read wiki/index.md, wiki/overview.md, wiki/decision/auth-strategy.md, wiki/decision/database-and-rbac.md, wiki/decision/v1-scope.md — continuing AstraBill, building [X]"

Why: index + overview gives the thesis. Decision pages carry the "never do X" constraints that are easy to miss. Negative decisions (e.g. "never Supabase Auth") must be read from the source file, not inferred from a one-line summary.
