/**
 * Public invoice view at `/i/[shareToken]` — what the customer sees when
 * they tap the WhatsApp button. Auth-free; the token IS the auth.
 *
 * Mobile-first: 90% of WhatsApped invoices open on phones. Compact card
 * layout, generous touch targets, a single primary CTA ("Download PDF").
 * The brand colour shows on a thin top stripe + the primary button, so
 * the customer sees a recognisably-branded invoice without overwhelm.
 *
 * Status badge is the only non-decorative ornament — it tells the customer
 * whether they still owe money at a glance.
 *
 * SEO: explicit `noindex, nofollow` per page so public invoices never make
 * it into search engines, regardless of what `robots.txt` does.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Invoice } from "@/lib/db/schema";
import { getPublicInvoiceView } from "@/lib/services/public-invoice";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<Invoice["type"], string> = {
  tax_invoice: "Tax Invoice",
  estimate: "Estimate",
  cash_receipt: "Cash Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  delivery_challan: "Delivery Challan",
};

const STATUS_TONE: Record<
  Invoice["status"],
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  draft: "neutral",
  sent: "info",
  seen: "info",
  partially_paid: "warning",
  paid: "success",
  overdue: "destructive",
};

const STATUS_LABEL: Record<Invoice["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  seen: "Viewed",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
};

/** Money: 2dp, Indian grouping. The customer-facing form. */
const fmt = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function addressLines(parts: Array<string | null>): string[] {
  return parts.map((p) => p?.trim()).filter((p): p is string => !!p);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}): Promise<Metadata> {
  const { shareToken } = await params;
  const view = await getPublicInvoiceView(shareToken);
  // Always set noindex — these are private documents shared by link, not
  // pages we want search engines to crawl.
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!view) return { ...base, title: "Invoice not found · AstraBill" };
  return {
    ...base,
    title: `Invoice ${view.invoice.number ?? "Draft"} · ${view.business.name}`,
    description: `Invoice from ${view.business.name}`,
  };
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const view = await getPublicInvoiceView(shareToken);
  if (!view) notFound();

  const { invoice, business, customer } = view;
  const taxClass =
    Number(invoice.igstAmount) > 0 ? "interstate" : "intrastate";
  const intrastate = taxClass === "intrastate";

  const businessAddr = addressLines([
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state, business.pincode]
      .filter(Boolean)
      .join(", ") || null,
  ]);
  const customerAddr = customer
    ? addressLines([
        customer.addressLine1,
        customer.addressLine2,
        [customer.city, customer.state, customer.pincode]
          .filter(Boolean)
          .join(", ") || null,
      ])
    : [];

  const showBreakdown =
    Number(invoice.discountAmount) > 0 ||
    invoice.extraCharges.some((c) => c.taxable);

  const brandStyle = {
    "--brand-accent": business.brandColor,
  } as CSSProperties;

  return (
    <div
      className="min-h-dvh bg-muted/40 px-4 py-6 sm:py-12"
      style={brandStyle}
    >
      <div className="mx-auto w-full max-w-2xl">
        {/* ---- business header ---- */}
        <header className="mb-5 flex flex-col items-center gap-2 text-center">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logoUrl}
              alt={business.name}
              className="h-16 w-16 rounded-lg object-cover"
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-lg text-2xl font-bold text-white"
              style={{ backgroundColor: business.brandColor }}
              aria-hidden
            >
              {business.name[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {business.name}
          </h1>
          {business.gstin && (
            <div className="font-mono text-xs text-muted-foreground">
              GSTIN {business.gstin}
            </div>
          )}
          {businessAddr.length > 0 && (
            <div className="text-xs text-muted-foreground whitespace-pre-line">
              {businessAddr.join("\n")}
            </div>
          )}
          {(business.phone || business.email) && (
            <div className="text-xs text-muted-foreground">
              {[business.phone, business.email].filter(Boolean).join(" · ")}
            </div>
          )}
        </header>

        {/* ---- invoice card ---- */}
        <Card className="overflow-hidden">
          <div
            className="h-1.5"
            style={{ backgroundColor: business.brandColor }}
            aria-hidden
          />
          <CardContent className="pt-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold">
                {TYPE_LABEL[invoice.type]}
              </div>
              <Badge tone={STATUS_TONE[invoice.status]}>
                {STATUS_LABEL[invoice.status]}
              </Badge>
            </div>

            {/* meta */}
            <dl className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Invoice no.
                </dt>
                <dd className="mt-0.5 font-mono">
                  {invoice.number ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Date
                </dt>
                <dd className="mt-0.5 tabular-nums">{invoice.issueDate}</dd>
              </div>
              {invoice.dueDate && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    Due
                  </dt>
                  <dd className="mt-0.5 tabular-nums">{invoice.dueDate}</dd>
                </div>
              )}
            </dl>

            {/* billed to */}
            <div className="mb-5 border-t border-border pt-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Billed to
              </div>
              {customer ? (
                <div className="mt-1">
                  <div className="font-semibold">{customer.name}</div>
                  {customer.gstin && (
                    <div className="font-mono text-xs text-muted-foreground">
                      GSTIN {customer.gstin}
                    </div>
                  )}
                  {customerAddr.length > 0 && (
                    <div className="mt-0.5 text-sm whitespace-pre-line text-foreground/90">
                      {customerAddr.join("\n")}
                    </div>
                  )}
                  {customer.phone && (
                    <div className="text-sm text-muted-foreground">
                      {customer.phone}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-1 text-muted-foreground">Walk-in customer</div>
              )}
            </div>

            {/* line items */}
            <div className="mb-5 -mx-5 overflow-x-auto sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2 font-medium sm:px-3">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Rate</th>
                    <th className="px-5 py-2 text-right font-medium sm:px-3">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((line) => (
                      <tr key={line.id} className="border-b border-border">
                        <td className="px-5 py-3 sm:px-3">
                          <div className="font-medium">{line.description}</div>
                          {line.hsnCode && (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              HSN {line.hsnCode}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {fmt(line.unitPrice)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium tabular-nums sm:px-3">
                          {fmt(line.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* totals */}
            <dl className="mb-5 ml-auto flex max-w-xs flex-col gap-1.5 text-sm tabular-nums">
              {showBreakdown && (
                <Row label="Subtotal" value={fmt(invoice.subtotal)} />
              )}
              {Number(invoice.discountAmount) > 0 && (
                <Row
                  label="Discount"
                  value={`− ${fmt(invoice.discountAmount)}`}
                />
              )}
              <Row label="Taxable" value={fmt(invoice.taxableAmount)} />
              {intrastate ? (
                <>
                  <Row label="CGST" value={fmt(invoice.cgstAmount)} />
                  <Row label="SGST" value={fmt(invoice.sgstAmount)} />
                </>
              ) : (
                <Row label="IGST" value={fmt(invoice.igstAmount)} />
              )}
              {invoice.roundOff !== "0.00" && invoice.roundOff !== "0" && (
                <Row
                  label="Round-off"
                  value={`${invoice.roundOff.startsWith("-") ? "−" : "+"} ${fmt(invoice.roundOff.replace(/^-/, ""))}`}
                />
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Total</span>
                <span>{fmt(invoice.total)}</span>
              </div>
              {Number(invoice.amountPaid) > 0 && (
                <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                  <span>Paid</span>
                  <span>{fmt(invoice.amountPaid)}</span>
                </div>
              )}
            </dl>

            {/* notes + terms */}
            {(invoice.notes || business.invoiceTerms) && (
              <div className="mb-5 grid grid-cols-1 gap-4 border-t border-border pt-4 text-xs sm:grid-cols-2">
                {invoice.notes && (
                  <div>
                    <div className="uppercase tracking-wider text-muted-foreground">
                      Notes
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground/90">
                      {invoice.notes}
                    </div>
                  </div>
                )}
                {business.invoiceTerms && (
                  <div>
                    <div className="uppercase tracking-wider text-muted-foreground">
                      Terms &amp; conditions
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground/90">
                      {business.invoiceTerms}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Download PDF */}
            <a
              href={`/api/i/${shareToken}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses("primary", "lg"), "w-full")}
              style={{
                backgroundColor: business.brandColor,
                borderColor: business.brandColor,
              }}
            >
              Download PDF
            </a>
          </CardContent>
        </Card>

        {/* ---- footer ---- */}
        {business.plan === "free" && (
          <div className="mt-5 text-center text-xs text-muted-foreground">
            Made with{" "}
            <Link href="/" className="font-semibold hover:underline">
              AstraBill
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
