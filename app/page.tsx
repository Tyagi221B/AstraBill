import Image from "next/image";
import Link from "next/link";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";
import brandmark from "@/public/astrabill-brandmark.png";
import wordmark from "@/public/astrabill-logo-primary.png";

const BRAND = "#2563eb";

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
    return <Landing />;
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
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Link
                    href={`/invoices/new?businessId=${business.id}`}
                    style={ctaPrimary}
                  >
                    + New invoice
                  </Link>
                  <Link
                    href={`/invoices?businessId=${business.id}`}
                    style={ctaSecondary}
                  >
                    View invoices →
                  </Link>
                </div>
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

// --- Landing (signed-out visitors) --------------------------------------

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Invoice on WhatsApp",
    body: "Create a GST invoice and send it straight to your customer's WhatsApp — where they actually read it.",
  },
  {
    title: "Get paid faster",
    body: "Every invoice carries a UPI payment link. One tap, the money lands, the bill reconciles itself.",
  },
  {
    title: "GST done right",
    body: "CGST/SGST/IGST, HSN summaries and round-off handled for you. No accountant required to raise a bill.",
  },
];

function Landing() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "#111",
        maxWidth: 960,
        margin: "0 auto",
        padding: "1.5rem 1.25rem 4rem",
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "3.5rem",
        }}
      >
        <Image
          src={wordmark}
          alt="AstraBill"
          priority
          style={{ height: 32, width: "auto", objectFit: "contain" }}
        />

        <Link
          href="/sign-in"
          style={{
            textDecoration: "none",
            color: "#333",
            fontSize: "0.9rem",
            fontWeight: 500,
          }}
        >
          Sign in →
        </Link>
      </nav>

      <section style={{ textAlign: "center", marginBottom: "3.5rem" }}>
        <Image
          src={brandmark}
          alt=""
          width={104}
          height={104}
          priority
          style={{ width: 104, height: 104, objectFit: "contain" }}
        />
        <p
          style={{
            color: BRAND,
            fontWeight: 600,
            fontSize: "0.85rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: "1rem 0 0.75rem",
          }}
        >
          It&apos;s that simple
        </p>
        <h1
          style={{
            fontSize: "2.6rem",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            margin: "0 auto 1rem",
            maxWidth: 640,
          }}
        >
          Billing built for the shop owner — not the accountant.
        </h1>
        <p
          style={{
            color: "#666",
            fontSize: "1.1rem",
            lineHeight: 1.6,
            margin: "0 auto 2rem",
            maxWidth: 540,
          }}
        >
          AstraBill is GST invoicing for Indian SMEs. Raise a bill, send it on
          WhatsApp with a UPI payment link, and watch it get paid — no training,
          no desktop software.
        </p>
        <Link
          href="/sign-in"
          style={{
            display: "inline-block",
            padding: "0.85rem 1.75rem",
            background: BRAND,
            color: "#fff",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          Get started — it&apos;s free →
        </Link>
        <p style={{ color: "#999", fontSize: "0.8rem", marginTop: "0.85rem" }}>
          20 invoices a month on the free plan. No card needed.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {FEATURES.map((f) => (
          <div
            key={f.title}
            style={{
              padding: "1.4rem 1.25rem",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.4rem" }}>
              {f.title}
            </h2>
            <p
              style={{
                color: "#666",
                fontSize: "0.9rem",
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {f.body}
            </p>
          </div>
        ))}
      </section>

      <footer
        style={{
          marginTop: "3.5rem",
          textAlign: "center",
          color: "#aaa",
          fontSize: "0.8rem",
        }}
      >
        © {new Date().getFullYear()} AstraBill · An Opryon Labs product
      </footer>
    </main>
  );
}
