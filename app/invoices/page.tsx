import Link from "next/link";
import type { Metadata } from "next";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { listInvoicesForUser } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";
import type { Invoice } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Invoices · AstraBill",
};

const TYPE_LABEL: Record<Invoice["type"], string> = {
  tax_invoice: "Tax Invoice",
  estimate: "Estimate",
  cash_receipt: "Cash Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  delivery_challan: "Delivery Challan",
};

const STATUS_COLOUR: Record<Invoice["status"], string> = {
  draft: "#888",
  sent: "#2563eb",
  seen: "#0891b2",
  partially_paid: "#ca8a04",
  paid: "#16a34a",
  overdue: "#dc2626",
};

const STATUSES: { value: Invoice["status"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

const card: React.CSSProperties = {
  padding: "1rem 1.25rem",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
};

const filterBtn = (active: boolean): React.CSSProperties => ({
  padding: "0.4rem 0.85rem",
  fontSize: "0.85rem",
  borderRadius: 6,
  border: `1px solid ${active ? "#111" : "#ddd"}`,
  background: active ? "#111" : "#fff",
  color: active ? "#fff" : "#444",
  textDecoration: "none",
  fontWeight: active ? 500 : 400,
});

export default async function InvoicesListPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string; status?: string }>;
}) {
  const user = await requireUser();
  const { businessId, status } = await searchParams;

  const memberships = await listBusinessesForUser(user.id);
  const businessById = new Map(memberships.map((m) => [m.business.id, m.business]));

  const activeStatus =
    status &&
    STATUSES.some((s) => s.value === status && s.value !== "all")
      ? (status as Invoice["status"])
      : undefined;

  const invoices = await listInvoicesForUser({
    userId: user.id,
    businessId,
    status: activeStatus,
    limit: 100,
  });

  const queryWithout = (drop: "status" | "businessId") => {
    const params = new URLSearchParams();
    if (drop !== "businessId" && businessId) params.set("businessId", businessId);
    if (drop !== "status" && status) params.set("status", status);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };
  const withParam = (key: "status" | "businessId", value: string) => {
    const params = new URLSearchParams();
    if (key !== "businessId" && businessId) params.set("businessId", businessId);
    if (key !== "status" && status) params.set("status", status);
    if (value !== "all") params.set(key, value);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const filterBusiness = businessId ? businessById.get(businessId) : null;

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "3rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Link
        href="/"
        style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}
      >
        ← Home
      </Link>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          margin: "1rem 0 1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", margin: 0 }}>
            {filterBusiness ? `${filterBusiness.name} — Invoices` : "Invoices"}
          </h1>
          <p style={{ color: "#666", margin: "0.15rem 0 0", fontSize: "0.9rem" }}>
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            {activeStatus ? ` · ${activeStatus.replace("_", " ")}` : ""}
          </p>
        </div>
        <Link
          href={
            filterBusiness
              ? `/invoices/new?businessId=${filterBusiness.id}`
              : "/invoices/new"
          }
          style={{
            padding: "0.6rem 1.1rem",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "0.9rem",
          }}
        >
          + New invoice
        </Link>
      </header>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.78rem", color: "#888", marginRight: "0.25rem" }}>
          Status
        </span>
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/invoices${withParam("status", s.value)}`}
            style={filterBtn(
              s.value === "all" ? !status : status === s.value,
            )}
          >
            {s.label}
          </Link>
        ))}
        {memberships.length > 1 && (
          <>
            <span
              style={{
                fontSize: "0.78rem",
                color: "#888",
                margin: "0 0.25rem 0 0.75rem",
              }}
            >
              Business
            </span>
            <Link
              href={`/invoices${queryWithout("businessId")}`}
              style={filterBtn(!businessId)}
            >
              All
            </Link>
            {memberships.map((m) => (
              <Link
                key={m.business.id}
                href={`/invoices${withParam("businessId", m.business.id)}`}
                style={filterBtn(businessId === m.business.id)}
              >
                {m.business.name}
              </Link>
            ))}
          </>
        )}
      </div>

      {invoices.length === 0 ? (
        <section style={{ ...card, textAlign: "center", padding: "2.5rem 1.25rem" }}>
          <p style={{ color: "#666", margin: 0 }}>
            No invoices{activeStatus ? ` with status ${activeStatus}` : ""} yet.
          </p>
          <Link
            href={
              filterBusiness
                ? `/invoices/new?businessId=${filterBusiness.id}`
                : "/invoices/new"
            }
            style={{
              display: "inline-block",
              marginTop: "1rem",
              padding: "0.6rem 1.1rem",
              background: "#111",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: "0.9rem",
            }}
          >
            Create your first invoice
          </Link>
        </section>
      ) : (
        <section style={card}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.92rem",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: "#888" }}>
                  <th style={{ padding: "0.5rem", width: "12%" }}>Number</th>
                  <th style={{ padding: "0.5rem", width: "16%" }}>Type</th>
                  <th style={{ padding: "0.5rem", width: "20%" }}>Business</th>
                  <th style={{ padding: "0.5rem", width: "13%" }}>Issued</th>
                  <th style={{ padding: "0.5rem", width: "14%" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const biz = businessById.get(inv.businessId);
                  return (
                    <tr
                      key={inv.id}
                      style={{
                        borderTop: "1px solid #f0f0f0",
                      }}
                    >
                      <td style={{ padding: "0.65rem 0.5rem" }}>
                        <Link
                          href={`/invoices/${inv.id}`}
                          style={{
                            color: "#111",
                            textDecoration: "none",
                            fontWeight: 500,
                          }}
                        >
                          {inv.number ?? (
                            <span
                              style={{ color: "#888", fontStyle: "italic" }}
                              title="Drafts are unnumbered. The number is assigned when you finalise."
                            >
                              Draft — number assigned on finalise
                            </span>
                          )}
                        </Link>
                      </td>
                      <td style={{ padding: "0.65rem 0.5rem", color: "#444" }}>
                        {TYPE_LABEL[inv.type]}
                      </td>
                      <td style={{ padding: "0.65rem 0.5rem", color: "#444" }}>
                        {biz?.name ?? "—"}
                      </td>
                      <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                        {inv.issueDate}
                      </td>
                      <td style={{ padding: "0.65rem 0.5rem" }}>
                        <span
                          style={{
                            padding: "0.2rem 0.55rem",
                            background: STATUS_COLOUR[inv.status],
                            color: "#fff",
                            borderRadius: 999,
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {inv.status.replace("_", " ")}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.65rem 0.5rem",
                          textAlign: "right",
                          fontWeight: 500,
                        }}
                      >
                        ₹ {inv.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
