/**
 * proxy.ts — Next.js 16 file convention (renamed from middleware.ts in v16).
 *
 * Defense-in-depth auth: visiting a protected PAGE while unauthenticated
 * gets redirected to /sign-in?callbackUrl=<original>. The user then signs
 * in and lands back where they were.
 *
 * What this is NOT:
 *   - A replacement for `requireUser()` inside route handlers / services.
 *     The Next.js docs explicitly warn that Server Functions are reached
 *     as POSTs to the page route, and "always verify authentication and
 *     authorization inside each Server Function rather than relying on
 *     Proxy alone." So our service-layer guards stay.
 *
 * Why API routes aren't matched here:
 *   - API routes return JSON. A 302 redirect from proxy would break the
 *     client's response parsing. Instead they each call requireUser() and
 *     return a typed 401 envelope on failure.
 *
 * Why /sign-in and / aren't matched:
 *   - /sign-in must be reachable when unauthenticated.
 *   - / serves both signed-in and signed-out users (different content
 *     branches inside the page) — redirecting unauthenticated traffic
 *     away from the landing page would be wrong UX for an SME product
 *     where the home doubles as marketing.
 *
 * Runtime: Node.js (Next.js 16's proxy can no longer run on Edge).
 */
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export default auth((req) => {
  // NextAuth's `auth()` wrapper populates req.auth from the JWT cookie —
  // no DB roundtrip under our JWT session strategy.
  if (req.auth) return NextResponse.next();

  const signInUrl = new URL("/sign-in", req.nextUrl);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  // Protect onboarding + every page under /invoices.
  // (Add new protected page roots here as the app grows.)
  //
  // We list both the bare path and the `:path*` form for each root because
  // `/invoices/:path*` is unambiguous for nested routes but path-to-regexp
  // behaviour for "matches the bare segment too?" depends on the version.
  // Being explicit removes the ambiguity.
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/invoices",
    "/invoices/:path*",
    "/customers",
    "/customers/:path*",
    "/products",
    "/products/:path*",
    "/settings",
    "/settings/:path*",
  ],
};
