/**
 * /b/[businessId]/cash-and-bank — money accounts surface.
 *
 * Cash drawers + bank accounts in one list. KPIs split cash subtotal vs bank
 * subtotal so the owner sees both at a glance. Per-row balance is computed
 * from `ledger_entries` (single source of truth, never a cached column).
 */
import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, Wallet } from "lucide-react";
import Decimal from "decimal.js";

import { EmptyState } from "@/components/app/EmptyState";
import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { balancesForMoneyAccounts } from "@/lib/repositories/ledger-entries";
import { listMoneyAccountsForUser } from "@/lib/services/money-accounts";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { AddMoneyAccountModal } from "./AddMoneyAccountModal";
import { AdjustBalanceModal } from "./AdjustBalanceModal";
import { TransferModal } from "./TransferModal";

export const metadata: Metadata = {
  title: "Cash & Bank · AstraBill",
};

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function CashAndBankPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const accounts = await listMoneyAccountsForUser({
    userId: user.id,
    businessId,
  });
  const balanceMap = await balancesForMoneyAccounts(accounts.map((a) => a.id));

  let total = new Decimal(0);
  let cashSubtotal = new Decimal(0);
  let bankSubtotal = new Decimal(0);
  for (const acc of accounts) {
    const bal = new Decimal(balanceMap.get(acc.id) ?? "0");
    total = total.plus(bal);
    if (acc.type === "cash") cashSubtotal = cashSubtotal.plus(bal);
    else bankSubtotal = bankSubtotal.plus(bal);
  }

  const balancesObj: Record<string, string> = {};
  for (const acc of accounts) {
    balancesObj[acc.id] = balanceMap.get(acc.id) ?? "0";
  }

  return (
    <>
      <PageHeader
        title="Cash & Bank"
        description="Every account your business operates — cash drawers + bank accounts. Balances come from the ledger, computed live."
        action={
          <>
            <AdjustBalanceModal
              accounts={accounts}
              balances={balancesObj}
            />
            <TransferModal accounts={accounts} balances={balancesObj} />
            <AddMoneyAccountModal businessId={businessId} />
          </>
        }
      />

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total balance" value={inr(total.toFixed(2))} />
        <Kpi label="Cash in hand" value={inr(cashSubtotal.toFixed(2))} />
        <Kpi label="Bank accounts" value={inr(bankSubtotal.toFixed(2))} />
      </section>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Every business needs at least one cash drawer. We auto-create one called 'Cash in hand' — add bank accounts as you go."
          action={<AddMoneyAccountModal businessId={businessId} />}
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Bank</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Balance
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => {
                    const bal = balanceMap.get(acc.id) ?? "0";
                    const isNeg = new Decimal(bal).lt(0);
                    return (
                      <tr
                        key={acc.id}
                        className="border-t border-border text-foreground"
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={b.moneyAccount(acc.id)}
                            className="hover:underline"
                          >
                            {acc.name}
                          </Link>
                          {acc.isDefault && (
                            <Badge tone="info" className="ml-2">
                              default
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {acc.type === "cash" ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Wallet className="h-3.5 w-3.5" /> Cash
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Banknote className="h-3.5 w-3.5" /> Bank
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {acc.bankName ?? "—"}
                          {acc.bankAccountNumber && (
                            <span className="ml-2">
                              ••••{acc.bankAccountNumber.slice(-4)}
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums font-medium ${
                            isNeg ? "text-red-700 dark:text-red-400" : ""
                          }`}
                        >
                          {inr(bal)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={b.moneyAccount(acc.id)}
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
