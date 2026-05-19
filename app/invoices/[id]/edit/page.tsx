import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { listCustomersForUser } from "@/lib/services/customers";
import { getInvoice } from "@/lib/services/invoices";
import { listProductsForUser } from "@/lib/services/products";
import { requireUser } from "@/lib/session";
import { InvoiceForm, type InvoiceFormInitial } from "../../new/InvoiceForm";

export const metadata: Metadata = {
  title: "Edit invoice · AstraBill",
};

// The form's accepted enum subsets. Credit/debit notes have a different flow
// (no edit-form UI yet) and are bounced below; the rest the form handles.
const FORM_TYPES = [
  "tax_invoice",
  "estimate",
  "cash_receipt",
  "delivery_challan",
] as const;
type FormType = (typeof FORM_TYPES)[number];
const FORM_UNITS = [
  "pcs",
  "sqft",
  "sqm",
  "kg",
  "linear_ft",
  "box",
  "dozen",
  "set",
] as const;
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

  // Credit/debit notes use a different flow we haven't built UI for yet.
  if (!(FORM_TYPES as readonly string[]).includes(invoice.type)) {
    redirect(`/invoices/${id}`);
  }

  const [memberships, customers, products] = await Promise.all([
    listBusinessesForUser(user.id),
    listCustomersForUser({ userId: user.id, limit: 500 }),
    listProductsForUser({ userId: user.id, limit: 500 }),
  ]);

  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    stateCode: m.business.stateCode,
    gstin: m.business.gstin,
  }));
  const customerOptions = customers.map((c) => ({
    id: c.id,
    businessId: c.businessId,
    name: c.name,
    stateCode: c.stateCode,
    gstin: c.gstin,
    addressLine1: c.addressLine1,
    addressLine2: c.addressLine2,
    city: c.city,
  }));
  const productOptions = products
    .filter((p) => p.isActive)
    .map((p) => ({
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      hsnCode: p.hsnCode,
      unit: p.unit,
      gstRate: p.gstRate,
      sellingPrice: p.sellingPrice,
    }));

  const initial: InvoiceFormInitial = {
    type: asFormType(invoice.type),
    customerId: invoice.customerId,
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    notes: invoice.notes,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    shipToName: invoice.shipToName,
    shipToAddress: invoice.shipToAddress,
    transportMode: invoice.transportMode,
    vehicleNumber: invoice.vehicleNumber,
    ewayBillNumber: invoice.ewayBillNumber,
    extraCharges: invoice.extraCharges.map((c) => ({
      label: c.label,
      amount: c.amount,
      taxable: c.taxable,
      gstRate: c.gstRate ?? "18",
    })),
    lineItems: invoice.lineItems
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({
        productId: l.productId,
        description: l.description,
        hsnCode: l.hsnCode ?? "",
        quantity: l.quantity,
        unit: asFormUnit(l.unit),
        secondaryQuantity: l.secondaryQuantity ?? "",
        secondaryUnit: l.secondaryUnit ? asFormUnit(l.secondaryUnit) : "",
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        gstRate: l.gstRate,
      })),
  };

  return (
    <AppShell
      crumbs={[
        { label: "Invoices", href: "/invoices" },
        { label: invoice.number ?? "Draft", href: `/invoices/${id}` },
        { label: "Edit" },
      ]}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Edit {invoice.number ?? "draft — number assigned on finalise"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drafts are fully editable. Once you finalise (mark as sent) the invoice
          becomes immutable — corrections then go through a credit note.
        </p>
      </div>
      <InvoiceForm
        businesses={businessOptions}
        customers={customerOptions}
        products={productOptions}
        initialBusinessId={invoice.businessId}
        editingInvoiceId={id}
        initial={initial}
      />
    </AppShell>
  );
}
