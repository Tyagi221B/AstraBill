import Link from "next/link";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";

const card: React.CSSProperties = {
  padding: "1rem 1.25rem",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fafafa",
};

const ctaPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "0.75rem 1.25rem",
  background: "#111",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 500,
};

const ctaSecondary: React.CSSProperties = {
  display: "inline-block",
  padding: "0.5rem 0.9rem",
  border: "1px solid #ddd",
  borderRadius: 8,
  textDecoration: "none",
  color: "#333",
  fontSize: "0.875rem",
};

export default async function Home() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <main
        style={{
          maxWidth: 720,
          margin: "4rem auto",
          padding: "0 1.25rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>AstraBill</h1>
        <p style={{ color: "#666", marginBottom: "2rem" }}>
          It&apos;s that simple.
        </p>
        <Link href="/sign-in" style={ctaPrimary}>
          Sign in →
        </Link>
      </main>
    );
  }

  const businesses = await listBusinessesForUser(user.id);

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "4rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2rem", margin: 0 }}>AstraBill</h1>
          <p style={{ color: "#888", margin: "0.1rem 0 0", fontSize: "0.9rem" }}>
            Signed in as {user.name ?? user.email ?? user.id}
          </p>
        </div>
        <SignOutButton />
      </header>

      {businesses.length === 0 ? (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
            One last step — set up your business
          </h2>
          <p style={{ color: "#666", margin: "0.5rem 0 1rem" }}>
            You need a business profile before you can raise invoices. Takes
            30 seconds.
          </p>
          <Link href="/onboarding" style={ctaPrimary}>
            Set up your business →
          </Link>
        </section>
      ) : (
        <section>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            Your businesses
          </h2>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {businesses.map(({ business, membership }) => (
              <li key={business.id} style={card}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <strong style={{ fontSize: "1.05rem" }}>
                    {business.name}
                  </strong>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#888",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {membership.role}
                  </span>
                </div>
                <p
                  style={{
                    color: "#666",
                    fontSize: "0.85rem",
                    margin: "0.3rem 0 0.75rem",
                  }}
                >
                  {business.gstin ? (
                    <>
                      GSTIN <code>{business.gstin}</code>
                    </>
                  ) : (
                    "No GSTIN — sends Estimates / Cash Receipts only"
                  )}
                  {business.stateCode &&
                    ` · State code ${business.stateCode}`}
                </p>
                <Link
                  href={`/invoices/new?businessId=${business.id}`}
                  style={ctaPrimary}
                >
                  + New invoice
                </Link>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
            <Link href="/onboarding" style={ctaSecondary}>
              + New business
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
