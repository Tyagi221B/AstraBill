# AstraBill

Billing software for Indian SMEs. Simple. Fast. WhatsApp-first.

## What's in this repo right now

- `wiki/` — product research, competitor analysis, and architecture decisions
- `CLAUDE.md` — wiki schema and workflow (used by Claude Code as context)

## Research Wiki

The wiki is a living knowledge base built using the [LLM Wiki pattern](https://github.com/tobi/llm-wiki). Start with:

- [`wiki/overview.md`](wiki/overview.md) — current product thesis
- [`wiki/index.md`](wiki/index.md) — full catalog of all pages

## Tech Stack (decided, not yet built)

| Layer | Choice |
|-------|--------|
| Frontend + API | Next.js 16 (Vercel) |
| Auth | NextAuth v5 + WhatsApp OTP |
| Database | Supabase PostgreSQL + Drizzle ORM |
| PDF Generation | Puppeteer microservice (Digital Ocean) |
| Background Jobs | BullMQ + Redis (Digital Ocean) |
| Payments | Razorpay (Smart Collect + Payment Links) |
| WhatsApp | Meta Cloud API |

## Status

🔬 Market research + architecture complete. Building starts next.
