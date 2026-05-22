/**
 * Marketing site header. Server component — the marketing layout passes the
 * auth state so the CTA reads "Dashboard" for signed-in visitors.
 *
 * Nav links are desktop-only for now; the always-visible CTA keeps the
 * primary action reachable on mobile. A full mobile menu is later polish.
 */
import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { COMPANY, COMPANY_URL } from "@/lib/seo";

const NAV = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how" },
  { label: "Pricing", href: "/#pricing" },
];

export function Header({ isAuthed }: { isAuthed: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <Link href="/" aria-label="AstraBill home">
            <Logo variant="wordmark" priority className="h-8 w-auto" />
          </Link>
          {/*
            Parent-company pill — visible declaration that AstraBill is a
            product of Opryon Labs. This is the brand-consistency signal
            Meta's WhatsApp Business reviewer looks for when approving the
            display name "AstraBill by Opryon Labs" / "AstraBill". The
            relationship is also declared machine-readably in JSON-LD via
            `parentOrganization` + `sameAs` (lib/seo.ts). Hidden on very
            narrow screens to keep mobile header uncramped; the text is
            still present in the SSR HTML for crawlers regardless.
          */}
          <a
            href={COMPANY_URL}
            target="_blank"
            rel="noopener"
            className="hidden rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-block"
          >
            by {COMPANY}
          </a>
        </div>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          {isAuthed ? (
            <Link href="/dashboard" className={buttonClasses("primary", "sm")}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                Sign in
              </Link>
              <Link href="/sign-in" className={buttonClasses("primary", "sm")}>
                Get started
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
