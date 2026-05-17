---
type: decision
updated: 2026-05-17
sources: 0
---

# Auth Strategy — NextAuth v5 + WhatsApp OTP

## Decisions (read these before writing any schema or code)

| Decision | Choice | Never |
|----------|--------|-------|
| Auth provider | NextAuth v5 (AuthJS) | ~~Supabase Auth~~ |
| OTP channel | WhatsApp (Meta API) | ~~SMS~~ |
| OTP storage | Redis with 5-min TTL | ~~Database table~~ |
| Session storage | Supabase DB via DrizzleAdapter | ~~Supabase Auth sessions~~ |

**There is no `otp_codes` table. OTPs live in Redis only.**

## Why Not Supabase Auth (Lesson Learned)

Indian ISPs have blocked Supabase's IP ranges before. When that happens, every user who tries to login hits a wall — regardless of whether they use Google OAuth or SMS OTP. The auth service lives on Supabase's infra, not yours. You have zero control.

Experienced this firsthand on TheGympilot — emergency migration to NextAuth in one night. We don't repeat that.

**Rule**: Use Supabase ONLY as a PostgreSQL database. Auth session storage lives in our own DB via DrizzleAdapter. Zero Supabase Auth dependency.

## Why WhatsApp OTP Over SMS OTP

| Factor | SMS OTP | WhatsApp OTP |
|--------|---------|-------------|
| Cost (India) | ₹0.12-0.20/message | ₹0.12/message (auth category) |
| Delivery rate | ~85-90% | ~99% (400M Indian users) |
| Delivery speed | 5-30 seconds | Instant |
| ISP blocking risk | High (SS7 vulnerabilities) | None |
| User familiarity | High | Higher (India is WhatsApp-first) |
| Fallback needed | Yes (SMS can fail) | Rarely |

WhatsApp authentication templates are approved by Meta specifically for OTP use. Delivery is near-instant. In India, if someone has a smartphone, they have WhatsApp.

## The Auth Flow

```
User enters phone number (e.g. 9876543210)
     ↓
Server: generate 6-digit OTP, store SHA-256 hash in Redis with 5-min TTL
     ↓
Send WhatsApp auth template: "Your AstraBill OTP is {{1}}. Valid for 5 minutes."
     ↓
User sees WhatsApp message, enters OTP in app
     ↓
Server: verify OTP against Redis hash, then delete the key (single-use)
     ↓
NextAuth credentials provider: returns user object
     ↓
NextAuth creates session → stored in Supabase DB (via DrizzleAdapter)
     ↓
User is in. Cookie set.
```

## Implementation

### OTP Storage: Redis, not DB

Someone correctly told the user "don't store OTP in DB." Here's the full explanation:

**Why not plain DB (PostgreSQL)?**
- OTPs are ephemeral — they exist for 5 minutes then are worthless
- Storing them in a persistent DB means cleanup jobs, index overhead, and the OTP lives in backups long after expiry
- If someone gets a DB snapshot (even a legitimate one), they see OTP hashes

**Why not plain text anywhere?**
Never store the raw 6-digit code. Hash it (SHA-256 is fine for OTPs — bcrypt is overkill and slow).

**The right answer: Redis with TTL**
```typescript
// Sending OTP:
const otp = generateSixDigitOTP()          // "847291"
const hash = sha256(otp + phone + secret)  // deterministic hash
await redis.set(`otp:${phone}`, hash, 'EX', 300)  // expires in 5 min, auto-deleted

// Send OTP to user via WhatsApp

// Verifying OTP:
const stored = await redis.get(`otp:${phone}`)
if (!stored) throw new Error('OTP expired')
const expected = sha256(submittedOtp + phone + secret)
if (stored !== expected) throw new Error('Invalid OTP')
await redis.del(`otp:${phone}`)  // single use
```

**Why this works for our architecture:**
- Redis is already on the DO droplet (for BullMQ)
- TTL means auto-cleanup — no cron job needed
- Hash means breach of Redis reveals nothing usable
- Single-use: deleted immediately after verification
- Fast: Redis lookup ~1ms vs DB query ~5-20ms

**The Vercel → DO Redis latency concern:**
Vercel serverless → DO Redis adds ~50-100ms per OTP request. This is acceptable for a login flow (user is waiting anyway). If it becomes a concern, add a Redis connection via Upstash (serverless Redis, works natively with Vercel edge functions).

**Rate limiting OTP requests (still needed):**
```typescript
const attempts = await redis.incr(`otp:attempts:${phone}`)
await redis.expire(`otp:attempts:${phone}`, 600)
if (attempts > 5) throw new TooManyRequestsError()
```
This also lives in Redis. Auto-resets after 10 minutes.

### NextAuth Config
```typescript
// auth.ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/server/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt' },  // or 'database' — JWT is stateless, faster
  providers: [
    Credentials({
      credentials: {
        phone: { label: 'Phone', type: 'text' },
        otp:   { label: 'OTP',   type: 'text' },
      },
      async authorize({ phone, otp }) {
        return authService.verifyOtp(phone as string, otp as string)
        // returns User object or null
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = user.id
      return token
    },
    session({ session, token }) {
      session.user.id = token.userId as string
      return session
    }
  }
})
```

### WhatsApp OTP Template

Template name: `astrabill_otp_v1`
Category: **Authentication** (₹0.12/message, Meta-approved for OTP use)

```
Your AstraBill login OTP is *{{1}}*.

Valid for 5 minutes. Do not share this with anyone.
```

Meta has a special "authentication" template category specifically for OTPs with built-in copy-button UX in WhatsApp.

## Fallback: Google OAuth

Add Google OAuth as a secondary provider (for users who prefer it). Takes 15 minutes to set up in NextAuth. Users who sign up via Google still get a phone number collected separately (needed for WhatsApp features).

```typescript
import Google from 'next-auth/providers/google'
// Just add to providers array. Done.
```

## Rate Limiting OTP Requests

Protect against OTP spam (someone hammering the endpoint):
```typescript
// middleware or API route
const attempts = await redis.incr(`otp:attempts:${phone}`)
if (attempts > 5) throw new TooManyRequestsError('Try again in 10 minutes')
await redis.expire(`otp:attempts:${phone}`, 600)  // 10-minute window
```

Redis is already on the DO droplet. No extra service needed.

## Related Pages

- [[decision/infrastructure]] — Redis on DO for rate limiting
- [[decision/database-and-rbac]] — DrizzleAdapter stores NextAuth sessions
- [[decision/whatsapp-meta-api]] — same Meta account, auth templates
