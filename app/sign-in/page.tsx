import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getSessionUser } from "@/lib/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in · AstraBill",
};

// Restrict the callbackUrl to same-origin paths so a crafted `?callbackUrl=`
// can't bounce an authed user to an attacker's domain.
function safeCallback(raw: string | undefined): string {
  if (!raw) return "/dashboard";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Outer page is sync — header, hero copy, and Card frame all ship as the
  // static shell. The session check ("already signed in? redirect") happens
  // inside a Suspense leaf so it doesn't block the chrome.
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" aria-label="AstraBill home">
            <Logo variant="wordmark" priority className="h-8 w-auto" />
          </Link>
          <ThemeToggle />
        </Container>
      </header>

      <main className="flex flex-1 items-center justify-center py-12">
        <Container className="max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome to <span className="text-brand-gradient">AstraBill</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to raise GST invoices, send them on WhatsApp, and get
              paid on UPI — all from your phone.
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              {/*
                The form itself is a Client Component so it renders instantly;
                the Suspense boundary only covers the session-check that
                might redirect away. If the user is already signed in, the
                redirect fires before the form ever paints.
              */}
              <Suspense fallback={<SignInForm />}>
                <SessionGate searchParams={searchParams} />
              </Suspense>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            It&apos;s that simple.
          </p>
        </Container>
      </main>
    </div>
  );
}

async function SessionGate({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getSessionUser();
  const { callbackUrl } = await searchParams;
  if (user) redirect(safeCallback(callbackUrl));
  return <SignInForm />;
}
