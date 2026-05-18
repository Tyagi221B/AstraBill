/**
 * Marketing site footer. Branding lockup is "AstraBill by Opryon Labs" —
 * AstraBill is the product, Opryon Labs the company.
 */
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] =
  [
    {
      heading: "Product",
      links: [
        { label: "Features", href: "/#features" },
        { label: "How it works", href: "/#how" },
        { label: "Pricing", href: "/#pricing" },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "Contact", href: "/contact" },
        { label: "Sign in", href: "/sign-in" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms & Conditions", href: "/terms" },
        { label: "Refund & Cancellation", href: "/refund" },
      ],
    },
  ];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/40">
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo variant="wordmark" className="h-7 w-auto" />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              GST billing for Indian businesses. It&apos;s that simple.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-sm font-semibold text-foreground">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-7 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-medium text-foreground">AstraBill</span> by
            Opryon Labs
          </p>
          <p>© {year} Opryon Labs. All rights reserved.</p>
        </div>
      </Container>
    </footer>
  );
}
