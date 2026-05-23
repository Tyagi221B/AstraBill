/**
 * /b/[businessId]/parties — unified Parties list (customers + suppliers).
 *
 * Balance surface is ledger-driven (see decision/full-ledger-pivot):
 *   - per-party balance  = SUM(debit) − SUM(credit) over `ledger_entries`
 *   - To Collect (KPI)   = SUM of positive balances (party owes us)
 *   - To Pay     (KPI)   = SUM of absolute negative balances (we owe party)
 *
 * Optional `?category=<id>` filter narrows the list to one workspace
 * category (the URL drives the filter so bookmarks + sharing work). The
 * KPI tiles always reflect the filtered set — they're what the owner is
 * actually looking at.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { balancesForParties } from "@/lib/repositories/ledger-entries";
import { listPartyCategoriesForUser } from "@/lib/repositories/party-categories";
import { listPartiesForUser } from "@/lib/services/parties";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Parties · AstraBill",
};

const fmt = (n: number | string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function PartiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const { category: filterCategoryId } = await searchParams;
  const b = routes.b(businessId);

  const [allParties, categories] = await Promise.all([
    listPartiesForUser({ userId: user.id, businessId, limit: 500 }),
    listPartyCategoriesForUser({ userId: user.id, businessId }),
  ]);

  const parties = filterCategoryId
    ? allParties.filter((p) => p.categoryId === filterCategoryId)
    : allParties;

  const balances = await balancesForParties(parties.map((p) => p.id));

  let toCollect = 0;
  let toPay = 0;
  for (const p of parties) {
    const bal = Number(balances.get(p.id) ?? "0");
    if (bal > 0) toCollect += bal;
    else if (bal < 0) toPay += -bal;
  }

  const customerCount = parties.filter((p) => p.type === "customer").length;
  const supplierCount = parties.length - customerCount;
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const activeCategory = filterCategoryId
    ? categoryById.get(filterCategoryId)
    : null;

  return (
    <>
      <PageHeader
        title="Parties"
        description={
          <span>
            <span>{customerCount}</span>{" "}
            <span className="text-muted-foreground/80">
              {customerCount === 1 ? "customer" : "customers"}
            </span>
            {" · "}
            <span>{supplierCount}</span>{" "}
            <span className="text-muted-foreground/80">
              {supplierCount === 1 ? "supplier" : "suppliers"}
            </span>
            {activeCategory && (
              <>
                {" · in "}
                <span className="font-medium text-foreground">
                  {activeCategory.name}
                </span>
              </>
            )}
          </span>
        }
        action={
          <Link href={b.newParty} className={buttonClasses("primary", "sm")}>
            + New party
          </Link>
        }
      />

      {categories.length > 0 && (
        <CategoryFilter
          businessId={businessId}
          categories={categories}
          activeId={filterCategoryId ?? null}
        />
      )}

      {parties.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiTile label="All parties" value={String(parties.length)} />
          <KpiTile
            label="To collect"
            value={fmt(toCollect)}
            tone="positive"
          />
          <KpiTile label="To pay" value={fmt(toPay)} tone="negative" />
        </div>
      )}

      {parties.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filterCategoryId ? "No parties in this category" : "No parties yet"}
          description={
            filterCategoryId
              ? "Tag a party with this category from the party form, or clear the filter above."
              : "Parties are who you buy from and sell to. Customers and suppliers live here — your books balance from the ledger they share."
          }
          action={
            <Link
              href={b.newParty}
              className={buttonClasses("primary", "sm")}
            >
              + Add{filterCategoryId ? " a party" : " your first party"}
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Mobile</th>
                    <th className="px-4 py-3 font-medium">GSTIN</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Balance
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => {
                    const bal = Number(balances.get(p.id) ?? "0");
                    const cat = p.categoryId
                      ? categoryById.get(p.categoryId)
                      : null;
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-border text-foreground"
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={b.party(p.id)}
                            className="hover:underline"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">
                          {p.type}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {cat ? (
                            <Badge tone="neutral">{cat.name}</Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.mobileNumber ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {p.gstin ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <BalanceCell amount={bal} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={b.party(p.id)}
                            className="text-sm text-primary hover:underline"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function CategoryFilter({
  businessId,
  categories,
  activeId,
}: {
  businessId: string;
  categories: { id: string; name: string }[];
  activeId: string | null;
}) {
  const base = routes.b(businessId).parties;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Link
        href={base}
        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
          !activeId
            ? "border-primary bg-primary/5 text-primary"
            : "border-input text-muted-foreground hover:border-ring hover:text-foreground"
        }`}
      >
        All
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`${base}?category=${c.id}`}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            activeId === c.id
              ? "border-primary bg-primary/5 text-primary"
              : "border-input text-muted-foreground hover:border-ring hover:text-foreground"
          }`}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function BalanceCell({ amount }: { amount: number }) {
  if (amount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (amount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <span aria-hidden>↑</span>
        {fmt(amount)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
      <span aria-hidden>↓</span>
      {fmt(-amount)}
    </span>
  );
}
