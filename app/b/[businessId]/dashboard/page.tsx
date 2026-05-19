/**
 * Dashboard — the home page for a business.
 *
 * Step-1 placeholder. The real KPI cards (outstanding ₹, paid this month,
 * recent invoices, top customers, low stock) land in Step 3. For now the
 * page proves the routing + branded chrome works end-to-end and gives the
 * owner the three actions they almost-always-want from a cold open.
 *
 * The business is resolved by the parent layout (`app/b/[businessId]/
 * layout.tsx`) — this page re-fetches its own copy of the row for the
 * page title and quick-action links. Next.js dedupes identical fetches
 * inside one request automatically; the SELECT is uuid-indexed and cheap.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  const b = routes.b(business.id);

  return (
    <>
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {business.name}
        </h1>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value="—" hint="Coming soon" />
        <StatCard label="Paid this month" value="—" hint="Coming soon" />
        <StatCard label="Invoices this month" value="—" hint="Coming soon" />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Quick actions</h2>
        <div className="flex flex-wrap gap-2.5">
          <Link href={b.newInvoice} className={buttonClasses("primary", "md")}>
            + New invoice
          </Link>
          <Link href={b.invoices} className={buttonClasses("outline", "md")}>
            View invoices
          </Link>
          <Link href={b.newCustomer} className={buttonClasses("outline", "md")}>
            + Add customer
          </Link>
          <Link href={b.newProduct} className={buttonClasses("outline", "md")}>
            + Add product
          </Link>
          <Link
            href={b.settings.branding}
            className={buttonClasses("outline", "md")}
          >
            Branding
          </Link>
        </div>
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1.5 text-2xl font-semibold tabular-nums">
          {value}
        </div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground/70">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
