/**
 * NextAuth v5 — two equal entry doors (Google OAuth + WhatsApp OTP).
 *
 * - Session strategy: JWT (stateless cookies). No `sessions` table.
 * - Adapter: custom-minimal — implements only what JWT+OAuth needs
 *   (`createUser`, `getUser`, `getUserByEmail`, `getUserByAccount`,
 *   `updateUser`, `linkAccount`). Does NOT need a `verification_token`
 *   table because we don't do email magic links.
 * - Credentials provider: phone + 6-digit OTP. `authorize()` verifies the
 *   code via lib/otp.ts and find-or-creates the `users` row by phone.
 * - Google provider: standard OAuth. The adapter handles user/account
 *   persistence on first sign-in.
 */
import "server-only";
import NextAuth, { type DefaultSession } from "next-auth";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db";
import { accounts, users } from "./db/schema";
import { verifyOtp } from "./otp";
import { normalizePhone } from "./phone";

// --- Minimal adapter (sized to JWT + OAuth only) -------------------------

function drizzleAuthAdapter(): Adapter {
  return {
    async createUser(user) {
      const [row] = await db
        .insert(users)
        .values({
          name: user.name ?? null,
          email: user.email,
          emailVerified: user.emailVerified ?? null,
          image: user.image ?? null,
        })
        .returning();
      if (!row) throw new Error("Failed to create user");
      return toAdapterUser(row);
    },
    async getUser(id) {
      const row = await db.query.users.findFirst({ where: eq(users.id, id) });
      return row ? toAdapterUser(row) : null;
    },
    async getUserByEmail(email) {
      const row = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      return row ? toAdapterUser(row) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const acct = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.provider, provider),
          eq(accounts.providerAccountId, providerAccountId),
        ),
      });
      if (!acct) return null;
      const row = await db.query.users.findFirst({
        where: eq(users.id, acct.userId),
      });
      return row ? toAdapterUser(row) : null;
    },
    async updateUser(user) {
      if (!user.id) throw new Error("updateUser called without id");
      const [row] = await db
        .update(users)
        .set({
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          emailVerified: user.emailVerified ?? undefined,
          image: user.image ?? undefined,
        })
        .where(eq(users.id, user.id))
        .returning();
      if (!row) throw new Error("Failed to update user");
      return toAdapterUser(row);
    },
    async linkAccount(account: AdapterAccount) {
      await db.insert(accounts).values({
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token ?? null,
        access_token: account.access_token ?? null,
        expires_at: account.expires_at ?? null,
        token_type: account.token_type ?? null,
        scope: account.scope ?? null,
        id_token: account.id_token ?? null,
        session_state:
          typeof account.session_state === "string"
            ? account.session_state
            : null,
      });
    },
  };
}

function toAdapterUser(row: typeof users.$inferSelect): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    emailVerified: row.emailVerified ?? null,
    image: row.image,
  };
}

// --- Providers -----------------------------------------------------------

const CredentialsInput = z.object({
  phone: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: drizzleAuthAdapter(),
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
    Credentials({
      name: "WhatsApp OTP",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        code: { label: "OTP", type: "text" },
      },
      async authorize(raw) {
        const parsed = CredentialsInput.safeParse(raw);
        if (!parsed.success) return null;
        const phone = normalizePhone(parsed.data.phone);
        const ok = await verifyOtp(phone, parsed.data.code);
        if (!ok) return null;
        const now = new Date();

        const existing = await db.query.users.findFirst({
          where: eq(users.phone, phone),
        });
        if (existing) {
          await db
            .update(users)
            .set({
              phoneVerifiedAt: existing.phoneVerifiedAt ?? now,
              lastLoginAt: now,
              lastActiveAt: now,
            })
            .where(eq(users.id, existing.id));
          return {
            id: existing.id,
            name: existing.name,
            email: existing.email,
            image: existing.image,
          };
        }
        const [created] = await db
          .insert(users)
          .values({
            phone,
            phoneVerifiedAt: now,
            lastLoginAt: now,
            lastActiveAt: now,
          })
          .returning();
        if (!created) return null;
        return {
          id: created.id,
          name: created.name,
          email: created.email,
          image: created.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
    async signIn({ user, account }) {
      // Refresh login timestamps for OAuth paths (Credentials does it inline).
      if (account?.provider !== "credentials" && user?.id) {
        const now = new Date();
        await db
          .update(users)
          .set({ lastLoginAt: now, lastActiveAt: now })
          .where(eq(users.id, user.id));
      }
      return true;
    },
  },
});

// --- Type augmentation: session.user.id is always present ----------------

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
  // The JWT token carries the user id between callbacks; runtime-checked
  // (`typeof token.userId === "string"`) before being read.
  interface JWT {
    userId?: string;
  }
}
