/**
 * /b/[businessId]/reports — landing page with cards for every V1 report.
 */
import Link from "next/link";
import type { Metadata } from "next";
import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Coins,
  FileText,
  Receipt,
  RotateCcw,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Reports · AstraBill" };

interface ReportCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export default async function ReportsLandingPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const cards: ReportCard[] = [
    {
      title: "Sales Register",
      description: "Every sales invoice in a date range with totals.",
      href: b.salesRegister,
      icon: Receipt,
    },
    {
      title: "Purchase Register",
      description: "Every purchase invoice in a date range.",
      href: b.purchaseRegister,
      icon: ClipboardList,
    },
    {
      title: "Party Statement",
      description: "Chronological ledger for one party with running balance.",
      href: b.partyStatement,
      icon: Building2,
    },
    {
      title: "Receivables Ageing",
      description: "Who owes you, bucketed by how long the bill's been open.",
      href: b.receivablesAgeing,
      icon: Coins,
    },
    {
      title: "Payables Ageing",
      description: "Who you owe, bucketed the same way.",
      href: b.payablesAgeing,
      icon: Wallet,
    },
    {
      title: "HSN Summary",
      description: "Taxable value + tax grouped by HSN code + GST rate.",
      href: b.hsnSummary,
      icon: BarChart3,
    },
    {
      title: "Stock Summary",
      description: "Closing stock and stock value across every product.",
      href: b.stockSummary,
      icon: Boxes,
    },
    {
      title: "GSTR-1 (Outward)",
      description: "B2B invoice export — CSV that pastes into the GST utility.",
      href: b.gstr1,
      icon: FileText,
    },
    {
      title: "GSTR-3B Summary",
      description: "Monthly summary tile values for the GSTR-3B return.",
      href: b.gstr3b,
      icon: RotateCcw,
    },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Everything the books can tell you. Every figure here is derived from the ledger — there's nothing cached we can't recompute."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="block">
              <Card className="h-full transition-colors hover:border-ring">
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {card.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
