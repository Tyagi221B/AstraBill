import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { getInvoice } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";
import { InvoiceForm, type InvoiceFormInitial } from "../../new/InvoiceForm";

export const metadata: Metadata = {
  title: "Edit invoice · AstraBill",
};

// Narrow the type/unit enums down to the form's accepted set.
const FORM_TYPES = ["tax_invoice", "estimate", "cash_receipt"] as const;
type FormType = (typeof FORM_TYPES)[number];
const FORM_UNITS = ["sqft", "kg", "pcs", "linear_ft", "box", "dozen"] as const;
type FormUnit = (typeof FORM_UNITS)[number];

function asFormType(t: string): FormType {
  return (FORM_TYPES as readonly string[]).includes(t)
    ? (t as FormType)
    : "tax_invoice";
}

function asFormUnit(u: string): FormUnit {
  return (FORM_UNITS as readonly string[]).includes(u)
    ? (u as FormUnit)
    : "pcs";
}

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const invoice = await getInvoice(id, user.id);
  if (!invoice) notFound();

  // Drafts only — finalised invoices are immutable. Bounce to detail page.
  if (invoice.status !== "draft") redirect(`/invoices/${id}`);

  // Credit/debit notes use a slightly different flow we haven't built UI for
  // yet — guard against editing them through this form.
  if (
    !(FORM_TYPES as readonly string[]).includes(invoice.type)
  ) {
    redirect(`/invoices/${id}`);
  }

  const memberships = await listBusinessesForUser(user.id);
  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    stateCode: m.business.stateCode,
    gstin: m.business.gstin,
  }));

  const initial: InvoiceFormInitial = {
    type: asFormType(invoice.type),
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    notes: invoice.notes,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    lineItems: invoice.lineItems
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({
        description: l.description,
        hsnCode: l.hsnCode ?? "",
        quantity: l.quantity,
        unit: asFormUnit(l.unit),
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        gstRate: l.gstRate,
      })),
  };

  return (
    <main
      style={{
        maxWidth: 880,
        margin: "3rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Link
        href={`/invoices/${id}`}
        style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}
      >
        ← Back to invoice
      </Link>
      <h1 style={{ fontSize: "1.75rem", margin: "1rem 0 0.25rem" }}>
        Edit {invoice.number ?? "draft invoice"}
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Drafts are fully editable. Once you finalise (mark as sent) the invoice
        becomes immutable — corrections then go through a credit note.
      </p>
      <InvoiceForm
        businesses={businessOptions}
        initialBusinessId={invoice.businessId}
        editingInvoiceId={id}
        initial={initial}
      />
    </main>
  );
}
