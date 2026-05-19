/**
 * AppShell — the chrome every authed page sits inside.
 *
 *   - Sticky header with Logo, optional crumbs, ThemeToggle, SignOut
 *   - Container-bounded body
 *
 * Server component. Pages still own `requireUser()` (the auth gate); this is
 * pure layout. Crumbs are a thin trail; the page sets its own H1 inside.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/app/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

export function AppShell({
  crumbs,
  children,
  className,
}: {
  crumbs?: Crumb[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" aria-label="AstraBill dashboard" className="shrink-0">
              <Logo variant="wordmark" className="h-8 w-auto" />
            </Link>
            {crumbs && crumbs.length > 0 && (
              <nav
                aria-label="Breadcrumb"
                className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:flex"
              >
                {crumbs.map((c, i) => (
                  <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                    <span aria-hidden="true" className="text-muted-foreground/60">
                      /
                    </span>
                    {c.href && i < crumbs.length - 1 ? (
                      <Link
                        href={c.href}
                        className="truncate transition-colors hover:text-foreground"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span className="truncate text-foreground">{c.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </Container>
      </header>
      <main className={cn("py-10", className)}>
        <Container>{children}</Container>
      </main>
    </div>
  );
}
