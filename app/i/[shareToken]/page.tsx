/**
 * Public document view at `/i/[shareToken]` — what the customer sees when
 * they tap the WhatsApp button. Auth-free; the token IS the auth.
 *
 * Reads the new-domain `documents` row (PR2 demolition cut over from the
 * legacy `invoices` table). Mobile-first: 90% of WhatsApped invoices open
 * on phones. Compact card layout, generous touch targets, a single primary
 * CTA ("Download PDF"). Brand colour shows on a thin top stripe + the
 * primary button.
 *
 * SEO: explicit `noindex, nofollow` per page — public shares never make it
 * into search engines, regardless of robots.txt.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense, type CSSProperties } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";
import { partyAddresses, type Document } from "@/lib/db/schema";
import { getPublicDocumentView } from "@/lib/services/public-document";
import { buildUpiPayUrl, renderUpiQrSvg } from "@/lib/upi";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<Document["docType"], string> = {
  sales_invoice: "Tax Invoice",
  estimate: "Estimate",
  delivery_challan: "Delivery Challan",
  credit_note: "Credit Note",
  purchase_invoice: "Purchase Invoice",
  debit_note: "Debit Note",
  quotation: "Quotation",
  proforma_invoice: "Proforma Invoice",
};

const STATUS_TONE: Record<
  Document["status"],
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  draft: "neutral",
  unpaid: "info",
  partial_paid: "warning",
  paid: "success",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<Document["status"], string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  partial_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

const fmt = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function addressLines(parts: Array<string | null>): string[] {
  return parts.map((p) => p?.trim()).filter((p): p is string => !!p);
}

/**
 * Fetch the party's default billing address (or first available). Inlined
 * here as a small query rather than a repo helper — used by exactly one
 * caller, the public page, and shape matches the rendered block 1:1.
 */
async function fetchBillingAddress(partyId: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(partyAddresses)
    .where(and(eq(partyAddresses.partyId, partyId), isNull(partyAddresses.deletedAt)));
  const billing =
    rows.find((r) => r.kind === "billing" && r.isDefault) ??
    rows.find((r) => r.kind === "billing") ??
    rows[0] ??
    null;
  if (!billing) return [];
  return addressLines([
    billing.streetAddress,
    [billing.city, billing.state, billing.pincode].filter(Boolean).join(", ") ||
      null,
  ]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}): Promise<Metadata> {
  const { shareToken } = await params;
  const view = await getPublicDocumentView(shareToken);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!view) return { ...base, title: "Invoice not found · AstraBill" };
  return {
    ...base,
    title: `${TYPE_LABEL[view.document.docType]} ${view.document.docNumber ?? "Draft"} · ${view.business.name}`,
    description: `${TYPE_LABEL[view.document.docType]} from ${view.business.name}`,
  };
}

export default function PublicDocumentPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  // Outer page is sync so Next can ship a static shell. The body resolves
  // inside the Suspense boundary — visitors see a tasteful skeleton (single
  // card matching the live layout's outer frame) while the document, party,
  // and address queries run.
  return (
    <Suspense fallback={<PublicDocumentSkeleton />}>
      <PublicDocumentContent params={params} />
    </Suspense>
  );
}

async function PublicDocumentContent({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const view = await getPublicDocumentView(shareToken);
  if (!view) notFound();

  const { document, lines, business, party } = view;
  const intrastate = Number(document.igstAmount) === 0;

  const businessAddr = addressLines([
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state, business.pincode]
      .filter(Boolean)
      .join(", ") || null,
  ]);
  const partyAddr = party ? await fetchBillingAddress(party.id) : [];

  const showBreakdown =
    Number(document.totalLineDiscount) > 0 ||
    Number(document.additionalChargesTaxable) > 0;

  const brandStyle = {
    "--brand-accent": business.brandColor,
  } as CSSProperties;

  // ---- UPI deep link ----------------------------------------------------
  // Render Pay button + QR when the business has set a VPA AND there's
  // money still due. Drafts/cancelled are intentionally hidden.
  // `outstanding` = grand_total − amount_received.
  const outstanding = Math.max(
    Number(document.grandTotal) - Number(document.amountReceived),
    0,
  ).toFixed(2);
  const payable =
    business.upiId &&
    document.docType === "sales_invoice" &&
    document.status !== "draft" &&
    document.status !== "paid" &&
    document.status !== "cancelled" &&
    Number(outstanding) > 0;
  const upiUrl = payable
    ? buildUpiPayUrl({
        vpa: business.upiId!,
        payeeName: business.name,
        amount: outstanding,
        invoiceNumber: document.docNumber,
      })
    : null;
  const upiQrSvg = upiUrl ? await renderUpiQrSvg(upiUrl) : null;

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

        {/* ---- document card ---- */}
        <Card className="overflow-hidden">
          <div
            className="h-1.5"
            style={{ backgroundColor: business.brandColor }}
            aria-hidden
          />
          <CardContent className="pt-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold">
                {TYPE_LABEL[document.docType]}
              </div>
              <Badge tone={STATUS_TONE[document.status]}>
                {STATUS_LABEL[document.status]}
              </Badge>
            </div>

            {/* meta */}
            <dl className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Number
                </dt>
                <dd className="mt-0.5 font-mono">
                  {document.docNumber ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Date
                </dt>
                <dd className="mt-0.5 tabular-nums">{document.docDate}</dd>
              </div>
              {document.dueDate && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    Due
                  </dt>
                  <dd className="mt-0.5 tabular-nums">{document.dueDate}</dd>
                </div>
              )}
            </dl>

            {/* billed to */}
            <div className="mb-5 border-t border-border pt-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Billed to
              </div>
              {party ? (
                <div className="mt-1">
                  <div className="font-semibold">{party.name}</div>
                  {party.gstin && (
                    <div className="font-mono text-xs text-muted-foreground">
                      GSTIN {party.gstin}
                    </div>
                  )}
                  {partyAddr.length > 0 && (
                    <div className="mt-0.5 text-sm whitespace-pre-line text-foreground/90">
                      {partyAddr.join("\n")}
                    </div>
                  )}
                  {party.mobileNumber && (
                    <div className="text-sm text-muted-foreground">
                      {party.mobileNumber}
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
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-border">
                      <td className="px-5 py-3 sm:px-3">
                        <div className="font-medium">
                          {line.itemNameSnapshot}
                        </div>
                        {line.description && (
                          <div className="text-xs text-muted-foreground">
                            {line.description}
                          </div>
                        )}
                        {line.hsnSacCodeSnapshot && (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            HSN {line.hsnSacCodeSnapshot}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {line.quantity}{" "}
                        {line.unitCodeSnapshot && (
                          <span className="text-muted-foreground">
                            {line.unitCodeSnapshot}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {fmt(line.pricePerUnit)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums sm:px-3">
                        {fmt(line.lineAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* totals */}
            <dl className="mb-5 ml-auto flex max-w-xs flex-col gap-1.5 text-sm tabular-nums">
              {showBreakdown && (
                <Row label="Subtotal" value={fmt(document.subtotal)} />
              )}
              {Number(document.totalLineDiscount) > 0 && (
                <Row
                  label="Discount"
                  value={`− ${fmt(document.totalLineDiscount)}`}
                />
              )}
              <Row label="Taxable" value={fmt(document.taxableAmount)} />
              {intrastate ? (
                <>
                  <Row label="CGST" value={fmt(document.cgstAmount)} />
                  <Row label="SGST" value={fmt(document.sgstAmount)} />
                </>
              ) : (
                <Row label="IGST" value={fmt(document.igstAmount)} />
              )}
              {document.roundOff !== "0.00" && document.roundOff !== "0" && (
                <Row
                  label="Round-off"
                  value={`${document.roundOff.startsWith("-") ? "−" : "+"} ${fmt(document.roundOff.replace(/^-/, ""))}`}
                />
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Total</span>
                <span>{fmt(document.grandTotal)}</span>
              </div>
              {Number(document.amountReceived) > 0 && (
                <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                  <span>Paid</span>
                  <span>{fmt(document.amountReceived)}</span>
                </div>
              )}
            </dl>

            {/* notes + terms */}
            {(document.notes || document.termsConditions) && (
              <div className="mb-5 grid grid-cols-1 gap-4 border-t border-border pt-4 text-xs sm:grid-cols-2">
                {document.notes && (
                  <div>
                    <div className="uppercase tracking-wider text-muted-foreground">
                      Notes
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground/90">
                      {document.notes}
                    </div>
                  </div>
                )}
                {document.termsConditions && (
                  <div>
                    <div className="uppercase tracking-wider text-muted-foreground">
                      Terms &amp; conditions
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground/90">
                      {document.termsConditions}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* UPI Pay button + QR */}
            {payable && upiUrl && upiQrSvg && (
              <div className="mb-3 rounded-xl border border-border bg-card p-4">
                <a
                  href={upiUrl}
                  className={cn(buttonClasses("primary", "lg"), "w-full")}
                  style={{
                    backgroundColor: business.brandColor,
                    borderColor: business.brandColor,
                  }}
                >
                  Pay {fmt(outstanding)} via UPI
                </a>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div
                    aria-label="UPI payment QR code"
                    className="rounded-lg border border-border bg-white p-2"
                    dangerouslySetInnerHTML={{ __html: upiQrSvg }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Or scan with any UPI app
                  </p>
                </div>
              </div>
            )}

            {/* Download PDF */}
            <a
              href={`/api/i/${shareToken}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonClasses(payable ? "outline" : "primary", "lg"),
                "w-full",
              )}
              style={
                payable
                  ? undefined
                  : {
                      backgroundColor: business.brandColor,
                      borderColor: business.brandColor,
                    }
              }
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

/**
 * Skeleton shown while the public document view is being fetched. Mirrors
 * the live page's outer frame: brand stripe + centered card with a stack
 * of placeholder rows. No CLS on swap.
 */
function PublicDocumentSkeleton() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="h-1 w-full bg-muted" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-4 w-32" />
            <div className="mt-6 flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-6 h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
