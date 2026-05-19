import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in · AstraBill",
};

export default function SignInPage() {
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
              <SignInForm />
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
