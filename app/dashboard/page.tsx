import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // proxy.ts already gates /dashboard; this is defense-in-depth.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/dashboard");

  const businesses = await listBusinessesForUser(user.id);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user.name ?? user.email ?? user.id}
        </p>
      </div>

      {businesses.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              One last step — set up your business
            </CardTitle>
            <CardDescription>
              You need a business profile before you can raise invoices. Takes
              30 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/onboarding"
              className={buttonClasses("primary", "md")}
            >
              Set up your business
            </Link>
          </CardContent>
        </Card>
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
              <li key={business.id}>
                <Card>
                  <CardContent className="pt-6">
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
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
