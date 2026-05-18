import Link from "next/link";
import type { Metadata } from "next";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { listProductsForUser } from "@/lib/services/products";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Products · AstraBill",
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

const formatINR = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default async function ProductsPage({
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

  const products = await listProductsForUser({
    userId: user.id,
    businessId,
    limit: 200,
  });

  // At least one row carries purchasePrice? Then this user can see profit
  // somewhere — surface the column. (The service has already redacted per
  // business; an undefined here means the user lacks the permission for
  // that row's business.)
  const showProfitColumn = products.some(
    (p) => p.purchasePrice !== undefined,
  );

  const newHref = `/products/new${
    businessId ? `?businessId=${businessId}` : ""
  }`;

  return (
    <main
      style={{
        maxWidth: 1040,
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
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Products</h1>
        <Link href={newHref} style={ctaPrimary}>
          + New product
        </Link>
      </header>

      {products.length === 0 ? (
        <section style={card}>
          <p style={{ margin: 0, color: "#666" }}>
            No products yet. Add the items you sell to make invoicing
            one-tap, and your stock will follow.
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
                <th style={{ padding: "0.5rem 0.5rem" }}>HSN</th>
                <th style={{ padding: "0.5rem 0.5rem" }}>Unit</th>
                <th style={{ padding: "0.5rem 0.5rem" }}>GST</th>
                <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>
                  Selling
                </th>
                {showProfitColumn && (
                  <th
                    style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}
                  >
                    Cost
                  </th>
                )}
                <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>
                  Stock
                </th>
                <th style={{ padding: "0.5rem 0.5rem" }}>Business</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const biz = businessById.get(p.businessId);
                return (
                  <tr
                    key={p.id}
                    style={{ borderTop: "1px solid #f0f0f0", color: "#333" }}
                  >
                    <td style={{ padding: "0.65rem 0.5rem", fontWeight: 500 }}>
                      {p.name}
                      {!p.isActive && (
                        <span style={{ color: "#aaa", marginLeft: "0.4rem" }}>
                          (inactive)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {p.hsnCode ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {p.unit}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {p.gstRate}%
                    </td>
                    <td
                      style={{
                        padding: "0.65rem 0.5rem",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatINR(p.sellingPrice)}
                    </td>
                    {showProfitColumn && (
                      <td
                        style={{
                          padding: "0.65rem 0.5rem",
                          textAlign: "right",
                          color: "#666",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {p.purchasePrice
                          ? formatINR(p.purchasePrice)
                          : p.purchasePrice === undefined
                            ? "—"
                            : "—"}
                      </td>
                    )}
                    <td
                      style={{
                        padding: "0.65rem 0.5rem",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {p.stock}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#666" }}>
                      {biz?.name ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem" }}>
                      <Link
                        href={`/products/${p.id}/edit`}
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
