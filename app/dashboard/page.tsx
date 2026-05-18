import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { SignOutButton } from "@/components/app/SignOutButton";
import { buttonClasses } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // proxy.ts already gates /dashboard; this is defense-in-depth.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");

  const businesses = await listBusinessesForUser(user.id);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" aria-label="AstraBill home">
            <Logo variant="wordmark" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </Container>
      </header>

      <Container className="py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user.name ?? user.email ?? user.id}
          </p>
        </div>

        {businesses.length === 0 ? (
          <section className="rounded-card border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-card-foreground">
              One last step — set up your business
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              You need a business profile before you can raise invoices. Takes
              30 seconds.
            </p>
            <Link
              href="/onboarding"
              className={`mt-4 ${buttonClasses("primary", "md")}`}
            >
              Set up your business
            </Link>
          </section>
        ) : (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your businesses</h2>
              <Link
                href="/onboarding"
                className={buttonClasses("outline", "sm")}
              >
                + New business
              </Link>
            </div>
            <ul className="flex flex-col gap-4">
              {businesses.map(({ business, membership }) => (
                <li
                  key={business.id}
                  className="rounded-card border border-border bg-card p-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <strong className="text-base text-card-foreground">
                      {business.name}
                    </strong>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {membership.role}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {business.gstin ? (
                      <>
                        GSTIN{" "}
                        <code className="font-mono text-xs">
                          {business.gstin}
                        </code>
                      </>
                    ) : (
                      "No GSTIN — sends Estimates / Cash Receipts only"
                    )}
                    {business.stateCode && ` · State code ${business.stateCode}`}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <Link
                      href={`/invoices/new?businessId=${business.id}`}
                      className={buttonClasses("primary", "sm")}
                    >
                      + New invoice
                    </Link>
                    <Link
                      href={`/invoices?businessId=${business.id}`}
                      className={buttonClasses("outline", "sm")}
                    >
                      Invoices
                    </Link>
                    <Link
                      href={`/customers?businessId=${business.id}`}
                      className={buttonClasses("outline", "sm")}
                    >
                      Customers
                    </Link>
                    <Link
                      href={`/products?businessId=${business.id}`}
                      className={buttonClasses("outline", "sm")}
                    >
                      Products
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>
    </div>
  );
}
