/**
 * /b/[businessId]/cash-and-bank/[id] — one money account.
 *
 * Header KPIs come from the ledger. The transactions log below is the
 * chronological ledger filtered to this account: opening balance, manual
 * adjustments, transfers, plus (later) payment_in / payment_out rows
 * driven by the documents pipeline.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Decimal from "decimal.js";

import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { LedgerEntry } from "@/lib/db/schema";
import {
  balanceForMoneyAccount,
  listEntriesForMoneyAccount,
} from "@/lib/repositories/ledger-entries";
import {
  getMoneyAccount,
  listMoneyAccountsForUser,
} from "@/lib/services/money-accounts";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { AdjustBalanceModal } from "../AdjustBalanceModal";
import { TransferModal } from "../TransferModal";
import { DeleteMoneyAccountButton } from "./DeleteMoneyAccountButton";

export const metadata: Metadata = { title: "Account · AstraBill" };

const VOUCHER_LABEL: Record<LedgerEntry["voucherType"], string> = {
  opening_balance: "Opening balance",
  sales_invoice: "Sales invoice",
  purchase_invoice: "Purchase invoice",
  credit_note: "Credit note",
  debit_note: "Debit note",
  payment_in: "Payment in",
  payment_out: "Payment out",
  settlement_discount: "Settlement discount",
  manual_adjustment: "Manual adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  bank_charges: "Bank charges",
  reversal: "Reversal",
};

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function MoneyAccountDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const account = await getMoneyAccount(id, user.id);
  if (!account || account.businessId !== businessId) notFound();
  const b = routes.b(businessId);

  const [balance, entries, allAccounts] = await Promise.all([
    balanceForMoneyAccount(account.id),
    listEntriesForMoneyAccount(account.id, 200),
    listMoneyAccountsForUser({ userId: user.id, businessId }),
  ]);
  const isBank = account.type === "bank";
  const balanceObj: Record<string, string> = { [account.id]: balance };
  const balanceIsZero = new Decimal(balance).eq(0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{account.name}</span>
            <Badge tone={isBank ? "info" : "neutral"} className="capitalize">
              {account.type}
            </Badge>
            {account.isDefault && <Badge tone="info">default</Badge>}
          </span>
        }
        description={
          <Link
            href={b.cashAndBank}
            className="text-muted-foreground hover:underline"
          >
            ← All accounts
          </Link>
        }
        action={
          <>
            <AdjustBalanceModal
              accounts={allAccounts}
              defaultAccountId={account.id}
              balances={balanceObj}
            />
            <TransferModal
              accounts={allAccounts}
              defaultFromId={account.id}
              balances={balanceObj}
            />
            <DeleteMoneyAccountButton
              accountId={account.id}
              businessId={businessId}
              disabled={!balanceIsZero}
            />
          </>
        }
      />

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          label="Running balance"
          value={inr(balance)}
          tone={new Decimal(balance).lt(0) ? "warning" : "neutral"}
          hint={
            new Decimal(balance).lt(0) ? "Overdrawn — review entries" : undefined
          }
        />
        <Kpi
          label="Transactions"
          value={String(entries.length)}
          hint={entries.length === 200 ? "Showing latest 200" : undefined}
        />
        <Kpi
          label="Status"
          value={balanceIsZero ? "Settled" : "Has balance"}
          tone={balanceIsZero ? "success" : "neutral"}
        />
      </section>

      {isBank && (
        <Card className="mb-5">
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Bank details</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <Field
                label="Account number"
                value={account.bankAccountNumber}
                mono
              />
              <Field label="IFSC" value={account.ifsc} mono />
              <Field label="Bank" value={account.bankName} />
              <Field label="Branch" value={account.branchName} />
              <Field label="Account holder" value={account.accountHolderName} />
              <Field label="UPI ID" value={account.upiId} mono />
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 className="text-base font-semibold">Transactions</h2>
            <span className="text-xs text-muted-foreground">
              Latest {entries.length}
            </span>
          </div>
          {entries.length === 0 ? (
            <div className="px-5 pb-8 pt-2 text-center text-sm text-muted-foreground">
              No transactions yet. Add money to record an opening balance, or
              accept a payment to see it land here.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-5 py-2 font-medium">Voucher</th>
                  <th className="px-5 py-2 text-right font-medium">Debit</th>
                  <th className="px-5 py-2 text-right font-medium">Credit</th>
                  <th className="px-5 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {e.entryDate ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {VOUCHER_LABEL[e.voucherType]}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                      {e.debitAmount ? inr(e.debitAmount) : ""}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-700 dark:text-red-400">
                      {e.creditAmount ? inr(e.creditAmount) : ""}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {e.narration ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 ${mono ? "font-mono" : ""} ${
          value ? "text-foreground" : ""
        }`}
      >
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
