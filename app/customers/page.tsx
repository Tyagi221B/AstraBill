import Link from "next/link";
import type { Metadata } from "next";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { listCustomersForUser } from "@/lib/services/customers";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Customers · AstraBill",
};

const card: React.CSSProperties = {
  padding: "1rem 1.25rem",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
};

const ctaPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "0.5rem 1rem",
  background: "#111",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  fontSize: "0.9rem",
  fontWeight: 500,
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await searchParams;

  const memberships = await listBusinessesForUser(user.id);
  const businessById = new Map(
    memberships.map((m) => [m.business.id, m.business]),
  );

  const customers = await listCustomersForUser({
    userId: user.id,
    businessId,
    limit: 200,
  });

  const newHref = `/customers/new${
    businessId ? `?businessId=${businessId}` : ""
  }`;

  return (
    <main
      style={{
        maxWidth: 960,
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
          alignItems: "baseline",
          justifyContent: "space-between",
          margin: "1rem 0 1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Customers</h1>
        <Link href={newHref} style={ctaPrimary}>
          + New customer
        </Link>
      </header>

      {customers.length === 0 ? (
        <section style={card}>
          <p style={{ margin: 0, color: "#666" }}>
            No customers yet. Walk-in sales work without a customer; saved
            customers make repeat invoices a one-tap pick.
          </p>
        </section>
      ) : (
        <section style={card}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "#666" }}>
                <th style={{ padding: "0.5rem 0.5rem" }}>Name</th>
                <th style={{ padding: "0.5rem 0.5rem" }}>Business</th>
                <th style={{ padding: "0.5rem 0.5rem" }}>Phone</th>
                <th style={{ padding: "0.5rem 0.5rem" }}>GSTIN</th>
                <th style={{ padding: "0.5rem 0.5rem" }}>City</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const biz = businessById.get(c.businessId);
                return (
                  <tr
                    key={c.id}
                    style={{ borderTop: "1px solid #f0f0f0", color: "#333" }}
                  >
                    <td style={{ padding: "0.65rem 0.5rem", fontWeight: 500 }}>
                      {c.name}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {biz?.name ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {c.phone ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {c.gstin ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {c.city ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem" }}>
                      <Link
                        href={`/customers/${c.id}/edit`}
                        style={{
                          color: "#2563eb",
                          textDecoration: "none",
                          fontSize: "0.85rem",
                        }}
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
