/**
 * Reports service — read-side aggregations over documents / ledger_entries /
 * item_stock_movements. Membership-scoped at the service entry; queries
 * run as plain `db.select()` over the schema (the relational-with hazard
 * note in DECISIONS.md applies — never use `.with` on numeric tables).
 *
 * Every report takes `{ businessId, userId }` and returns plain data;
 * formatting (₹ commas, percentages) happens at the UI edge.
 */
import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import Decimal from "decimal.js";

import { db } from "../db";
import {
  type Document,
  type Item,
  type LedgerEntry,
  type Party,
  businessMembers,
  documentLineItems,
  documents,
  stockMovements,
  items,
  ledgerEntries,
  parties,
} from "../db/schema";

async function requireMember(userId: string, businessId: string): Promise<boolean> {
  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.businessId, businessId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member !== undefined;
}

// ─── Sales / Purchase Register ─────────────────────────────────────────────

export interface RegisterRow {
  doc: Document;
  partyName: string | null;
}

export async function getSalesRegister(opts: {
  userId: string;
  businessId: string;
  from?: string; // YYYY-MM-DD
  to?: string;
}): Promise<RegisterRow[]> {
  if (!(await requireMember(opts.userId, opts.businessId))) return [];
  const where = [
    eq(documents.businessId, opts.businessId),
    eq(documents.docType, "sales_invoice"),
    isNull(documents.deletedAt),
  ];
  if (opts.from) where.push(gte(documents.docDate, opts.from));
  if (opts.to) where.push(lte(documents.docDate, opts.to));
  return db
    .select({
      doc: documents,
      partyName: parties.name,
    })
    .from(documents)
    .leftJoin(parties, eq(parties.id, documents.partyId))
    .where(and(...where))
    .orderBy(asc(documents.docDate), asc(documents.docNumber));
}

export async function getPurchaseRegister(opts: {
  userId: string;
  businessId: string;
  from?: string;
  to?: string;
}): Promise<RegisterRow[]> {
  if (!(await requireMember(opts.userId, opts.businessId))) return [];
  const where = [
    eq(documents.businessId, opts.businessId),
    eq(documents.docType, "purchase_invoice"),
    isNull(documents.deletedAt),
  ];
  if (opts.from) where.push(gte(documents.docDate, opts.from));
  if (opts.to) where.push(lte(documents.docDate, opts.to));
  return db
    .select({
      doc: documents,
      partyName: parties.name,
    })
    .from(documents)
    .leftJoin(parties, eq(parties.id, documents.partyId))
    .where(and(...where))
    .orderBy(asc(documents.docDate), asc(documents.docNumber));
}

// ─── Party Statement ──────────────────────────────────────────────────────

export interface PartyStatement {
  party: Party;
  entries: LedgerEntry[];
  openingBalance: string;
  closingBalance: string;
}

export async function getPartyStatement(opts: {
  userId: string;
  businessId: string;
  partyId: string;
  from?: string;
  to?: string;
}): Promise<PartyStatement | null> {
  if (!(await requireMember(opts.userId, opts.businessId))) return null;
  const [party] = await db
    .select()
    .from(parties)
    .where(
      and(
        eq(parties.id, opts.partyId),
        eq(parties.businessId, opts.businessId),
        isNull(parties.deletedAt),
      ),
    );
  if (!party) return null;

  // Opening: sum of ledger entries before `from`. If no `from`, opening is 0.
  let openingBalance = "0";
  if (opts.from) {
    const [row] = await db
      .select({
        bal: sql<string>`coalesce(
          sum(${ledgerEntries.debitAmount}) - sum(${ledgerEntries.creditAmount}),
          0
        )::text`,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.partyId, opts.partyId),
          sql`${ledgerEntries.entryDate} < ${opts.from}`,
        ),
      );
    openingBalance = row?.bal ?? "0";
  }

  const where = [eq(ledgerEntries.partyId, opts.partyId)];
  if (opts.from) where.push(gte(ledgerEntries.entryDate, opts.from));
  if (opts.to) where.push(lte(ledgerEntries.entryDate, opts.to));
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(and(...where))
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.createdAt));

  // Closing = opening + sum(window)
  let closing = new Decimal(openingBalance);
  for (const e of entries) {
    closing = closing
      .plus(e.debitAmount ?? "0")
      .minus(e.creditAmount ?? "0");
  }
  return {
    party,
    entries,
    openingBalance,
    closingBalance: closing.toFixed(2),
  };
}

// ─── Ageing (Receivables / Payables) ──────────────────────────────────────

export type AgeingBucket = "0-30" | "31-60" | "61-90" | "90+";

export interface AgeingRow {
  party: Party;
  total: string;
  bucket0_30: string;
  bucket31_60: string;
  bucket61_90: string;
  bucket90Plus: string;
}

/**
 * Per-party ageing of OUTSTANDING balances on finalised non-cancelled
 * documents. Receivables: positive (we are owed); Payables: negative
 * (we owe). The age is computed from `due_date` (falling back to
 * `doc_date`) to today.
 */
export async function getAgeing(opts: {
  userId: string;
  businessId: string;
  side: "receivables" | "payables";
  asOf?: string; // YYYY-MM-DD, defaults to today
}): Promise<AgeingRow[]> {
  if (!(await requireMember(opts.userId, opts.businessId))) return [];
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  // Pull all open documents (unpaid / partial_paid) for this business.
  const openDocs = await db
    .select({
      doc: documents,
      partyName: parties.name,
    })
    .from(documents)
    .leftJoin(parties, eq(parties.id, documents.partyId))
    .where(
      and(
        eq(documents.businessId, opts.businessId),
        isNull(documents.deletedAt),
        sql`${documents.status} in ('unpaid','partial_paid')`,
        sql`${documents.docType} in ('sales_invoice','credit_note','purchase_invoice','debit_note')`,
      ),
    );

  // For receivables: a sales_invoice ⇒ +outstanding; credit_note ⇒ -outstanding.
  // For payables: purchase_invoice ⇒ +outstanding; debit_note ⇒ -outstanding.
  const byParty = new Map<
    string,
    { party: Party | null; bucket0_30: Decimal; bucket31_60: Decimal; bucket61_90: Decimal; bucket90Plus: Decimal; total: Decimal }
  >();

  for (const { doc, partyName: _ } of openDocs) {
    const balance = new Decimal(doc.grandTotal).sub(doc.amountReceived);
    const signed =
      opts.side === "receivables"
        ? doc.docType === "sales_invoice"
          ? balance
          : doc.docType === "credit_note"
            ? balance.negated()
            : null
        : doc.docType === "purchase_invoice"
          ? balance
          : doc.docType === "debit_note"
            ? balance.negated()
            : null;
    if (!signed) continue;
    if (signed.eq(0)) continue;

    const due = doc.dueDate ?? doc.docDate;
    const daysOpen = daysBetween(due, asOf);

    let entry = byParty.get(doc.partyId);
    if (!entry) {
      entry = {
        party: null,
        bucket0_30: new Decimal(0),
        bucket31_60: new Decimal(0),
        bucket61_90: new Decimal(0),
        bucket90Plus: new Decimal(0),
        total: new Decimal(0),
      };
      byParty.set(doc.partyId, entry);
    }
    if (daysOpen <= 30) entry.bucket0_30 = entry.bucket0_30.plus(signed);
    else if (daysOpen <= 60) entry.bucket31_60 = entry.bucket31_60.plus(signed);
    else if (daysOpen <= 90) entry.bucket61_90 = entry.bucket61_90.plus(signed);
    else entry.bucket90Plus = entry.bucket90Plus.plus(signed);
    entry.total = entry.total.plus(signed);
  }

  // Pull the full Party rows for the ids we have.
  const partyIds = Array.from(byParty.keys());
  if (partyIds.length === 0) return [];
  const partyRows = await db
    .select()
    .from(parties)
    .where(
      and(
        eq(parties.businessId, opts.businessId),
        sql`${parties.id} = ANY(ARRAY[${sql.join(
          partyIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}])`,
        isNull(parties.deletedAt),
      ),
    );
  for (const p of partyRows) {
    const entry = byParty.get(p.id);
    if (entry) entry.party = p;
  }

  return Array.from(byParty.values())
    .filter((v) => v.party && !v.total.eq(0))
    .map((v) => ({
      party: v.party!,
      total: v.total.toFixed(2),
      bucket0_30: v.bucket0_30.toFixed(2),
      bucket31_60: v.bucket31_60.toFixed(2),
      bucket61_90: v.bucket61_90.toFixed(2),
      bucket90Plus: v.bucket90Plus.toFixed(2),
    }))
    .sort((a, b) =>
      new Decimal(b.total).abs().cmp(new Decimal(a.total).abs()),
    );
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ─── HSN Summary ──────────────────────────────────────────────────────────

export interface HsnSummaryRow {
  hsnCode: string;
  gstRate: string | null;
  totalQty: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
}

export async function getHsnSummary(opts: {
  userId: string;
  businessId: string;
  from?: string;
  to?: string;
  /** Defaults to outward (sales). Pass "purchase" for the inward summary. */
  side?: "sales" | "purchase";
}): Promise<HsnSummaryRow[]> {
  if (!(await requireMember(opts.userId, opts.businessId))) return [];
  const side = opts.side ?? "sales";
  const docTypes =
    side === "sales"
      ? ["sales_invoice", "credit_note"]
      : ["purchase_invoice", "debit_note"];

  const where = [
    eq(documents.businessId, opts.businessId),
    isNull(documents.deletedAt),
    sql`${documents.status} != 'draft' and ${documents.status} != 'cancelled'`,
    sql`${documents.docType} = ANY(ARRAY[${sql.join(
      docTypes.map((t) => sql`${t}::doc_type`),
      sql`, `,
    )}])`,
  ];
  if (opts.from) where.push(gte(documents.docDate, opts.from));
  if (opts.to) where.push(lte(documents.docDate, opts.to));

  const rows = await db
    .select({
      hsn: documentLineItems.hsnSacCodeSnapshot,
      gstRate: documentLineItems.gstRate,
      qty: sql<string>`sum(${documentLineItems.quantity})::text`,
      taxable: sql<string>`sum(${documentLineItems.taxableAmount})::text`,
      cgst: sql<string>`sum(${documentLineItems.cgstAmount})::text`,
      sgst: sql<string>`sum(${documentLineItems.sgstAmount})::text`,
      igst: sql<string>`sum(${documentLineItems.igstAmount})::text`,
    })
    .from(documentLineItems)
    .innerJoin(documents, eq(documents.id, documentLineItems.documentId))
    .where(and(...where))
    .groupBy(documentLineItems.hsnSacCodeSnapshot, documentLineItems.gstRate)
    .orderBy(asc(documentLineItems.hsnSacCodeSnapshot));

  return rows.map((r) => {
    const totalTax = new Decimal(r.cgst ?? "0")
      .plus(r.sgst ?? "0")
      .plus(r.igst ?? "0")
      .toFixed(2);
    return {
      hsnCode: r.hsn ?? "—",
      gstRate: r.gstRate,
      totalQty: r.qty ?? "0",
      taxableAmount: r.taxable ?? "0",
      cgstAmount: r.cgst ?? "0",
      sgstAmount: r.sgst ?? "0",
      igstAmount: r.igst ?? "0",
      totalTax,
    };
  });
}

// ─── Stock Summary ────────────────────────────────────────────────────────

export interface StockSummaryRow {
  item: Item;
  closingStock: string;
  stockValue: string;
}

export async function getStockSummary(opts: {
  userId: string;
  businessId: string;
}): Promise<StockSummaryRow[]> {
  if (!(await requireMember(opts.userId, opts.businessId))) return [];

  // Pull products + their summed movement qty in one query.
  const rows = await db
    .select({
      item: items,
      total: sql<string>`coalesce(sum(${stockMovements.qty}), 0)::text`,
    })
    .from(items)
    .leftJoin(
      stockMovements,
      eq(stockMovements.itemId, items.id),
    )
    .where(
      and(
        eq(items.businessId, opts.businessId),
        eq(items.type, "product"),
        isNull(items.deletedAt),
      ),
    )
    .groupBy(items.id)
    .orderBy(asc(items.name));

  return rows.map((r) => {
    const stock = new Decimal(r.total);
    const value = r.item.purchasePrice
      ? stock.times(r.item.purchasePrice)
      : new Decimal(0);
    return {
      item: r.item,
      closingStock: stock.toFixed(3),
      stockValue: value.toFixed(2),
    };
  });
}

// ─── GSTR-3B summary tile values ──────────────────────────────────────────

export interface Gstr3bSummary {
  outwardTaxable: string;
  outwardZeroRated: string;
  outwardExempt: string;
  outwardTax: { cgst: string; sgst: string; igst: string; totalTax: string };
  inwardTax: { cgst: string; sgst: string; igst: string; totalTax: string };
  netGstPayable: string;
}

export async function getGstr3bSummary(opts: {
  userId: string;
  businessId: string;
  from: string;
  to: string;
}): Promise<Gstr3bSummary | null> {
  if (!(await requireMember(opts.userId, opts.businessId))) return null;
  // Outward: sales_invoice. Credit notes reduce.
  const outward = await sumDocSide(opts.businessId, ["sales_invoice", "credit_note"], opts.from, opts.to);
  const inward = await sumDocSide(opts.businessId, ["purchase_invoice", "debit_note"], opts.from, opts.to);

  // For outward we count credit_note as a NEGATIVE adjustment to outward
  // figures. For inward, debit_note (return to supplier) reduces inward.
  // The SUMs from sumDocSide are unsigned; we adjust by doc_type below.
  const outwardSummary = await splitByExemptStatus(opts.businessId, "sales", opts.from, opts.to);

  const netGst = new Decimal(outward.totalTax).sub(inward.totalTax).toFixed(2);
  return {
    outwardTaxable: outwardSummary.taxable,
    outwardZeroRated: outwardSummary.zeroRated,
    outwardExempt: outwardSummary.exempt,
    outwardTax: outward,
    inwardTax: inward,
    netGstPayable: netGst,
  };
}

async function sumDocSide(
  businessId: string,
  docTypes: string[],
  from: string,
  to: string,
): Promise<{ cgst: string; sgst: string; igst: string; totalTax: string }> {
  const [row] = await db
    .select({
      cgst: sql<string>`coalesce(sum(${documents.cgstAmount}), 0)::text`,
      sgst: sql<string>`coalesce(sum(${documents.sgstAmount}), 0)::text`,
      igst: sql<string>`coalesce(sum(${documents.igstAmount}), 0)::text`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.businessId, businessId),
        isNull(documents.deletedAt),
        sql`${documents.status} != 'draft' and ${documents.status} != 'cancelled'`,
        sql`${documents.docType} = ANY(ARRAY[${sql.join(
          docTypes.map((t) => sql`${t}::doc_type`),
          sql`, `,
        )}])`,
        gte(documents.docDate, from),
        lte(documents.docDate, to),
      ),
    );
  const total = new Decimal(row?.cgst ?? "0")
    .plus(row?.sgst ?? "0")
    .plus(row?.igst ?? "0")
    .toFixed(2);
  return {
    cgst: row?.cgst ?? "0",
    sgst: row?.sgst ?? "0",
    igst: row?.igst ?? "0",
    totalTax: total,
  };
}

async function splitByExemptStatus(
  businessId: string,
  side: "sales" | "purchase",
  from: string,
  to: string,
): Promise<{ taxable: string; zeroRated: string; exempt: string }> {
  const docTypes =
    side === "sales"
      ? ["sales_invoice", "credit_note"]
      : ["purchase_invoice", "debit_note"];
  // Group line items by exempt-vs-nil-vs-taxable.
  const rows = await db
    .select({
      gstRate: documentLineItems.gstRate,
      taxable: sql<string>`coalesce(sum(${documentLineItems.taxableAmount}), 0)::text`,
    })
    .from(documentLineItems)
    .innerJoin(documents, eq(documents.id, documentLineItems.documentId))
    .where(
      and(
        eq(documents.businessId, businessId),
        isNull(documents.deletedAt),
        sql`${documents.status} != 'draft' and ${documents.status} != 'cancelled'`,
        sql`${documents.docType} = ANY(ARRAY[${sql.join(
          docTypes.map((t) => sql`${t}::doc_type`),
          sql`, `,
        )}])`,
        gte(documents.docDate, from),
        lte(documents.docDate, to),
      ),
    )
    .groupBy(documentLineItems.gstRate);

  let taxable = new Decimal(0);
  let zeroRated = new Decimal(0);
  let exempt = new Decimal(0);
  for (const r of rows) {
    const amt = new Decimal(r.taxable ?? "0");
    if (r.gstRate === null) exempt = exempt.plus(amt);
    else if (new Decimal(r.gstRate).eq(0)) zeroRated = zeroRated.plus(amt);
    else taxable = taxable.plus(amt);
  }
  return {
    taxable: taxable.toFixed(2),
    zeroRated: zeroRated.toFixed(2),
    exempt: exempt.toFixed(2),
  };
}

// ─── GSTR-1 export (CSV) ──────────────────────────────────────────────────

/**
 * GSTR-1 B2B sheet rows. Format approximates the GST portal's offline
 * utility CSV — owner pastes into the utility for upload. Validation of
 * exact column names happens against a known-good invoice before launch.
 */
export interface Gstr1B2bRow {
  gstin: string;
  receiverName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: string;
  placeOfSupply: string;
  rate: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
}

export async function getGstr1B2b(opts: {
  userId: string;
  businessId: string;
  from: string;
  to: string;
}): Promise<Gstr1B2bRow[]> {
  if (!(await requireMember(opts.userId, opts.businessId))) return [];
  const rows = await db
    .select({
      doc: documents,
      partyName: parties.name,
      partyGstin: parties.gstin,
    })
    .from(documents)
    .leftJoin(parties, eq(parties.id, documents.partyId))
    .where(
      and(
        eq(documents.businessId, opts.businessId),
        eq(documents.docType, "sales_invoice"),
        isNull(documents.deletedAt),
        sql`${documents.status} != 'draft' and ${documents.status} != 'cancelled'`,
        gte(documents.docDate, opts.from),
        lte(documents.docDate, opts.to),
        sql`${parties.gstin} is not null`,
      ),
    )
    .orderBy(asc(documents.docDate), asc(documents.docNumber));

  return rows.map((r) => ({
    gstin: r.partyGstin ?? "",
    receiverName: r.partyName ?? "",
    invoiceNumber: r.doc.docNumber ?? "",
    invoiceDate: r.doc.docDate,
    invoiceValue: r.doc.grandTotal,
    placeOfSupply: r.doc.placeOfSupplyStateCode ?? "",
    rate:
      Number(r.doc.igstAmount) > 0
        ? String(deriveOverallRate(r.doc))
        : String(deriveOverallRate(r.doc)),
    taxableValue: r.doc.taxableAmount,
    cgst: r.doc.cgstAmount,
    sgst: r.doc.sgstAmount,
    igst: r.doc.igstAmount,
  }));
}

function deriveOverallRate(doc: Document): number {
  const taxable = new Decimal(doc.taxableAmount);
  if (taxable.eq(0)) return 0;
  const totalTax = new Decimal(doc.totalTaxAmount);
  return Number(totalTax.div(taxable).times(100).toFixed(2));
}

export function gstr1B2bToCsv(rows: Gstr1B2bRow[]): string {
  const header = [
    "GSTIN/UIN of Recipient",
    "Receiver Name",
    "Invoice Number",
    "Invoice Date",
    "Invoice Value",
    "Place of Supply",
    "Rate",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.gstin,
      csvEscape(r.receiverName),
      r.invoiceNumber,
      r.invoiceDate,
      r.invoiceValue,
      r.placeOfSupply,
      r.rate,
      r.taxableValue,
      r.cgst,
      r.sgst,
      r.igst,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
