import Link from "next/link";
import { getSessionUser } from "@/lib/session";

export default async function Home() {
  const user = await getSessionUser();
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
      <p style={{ color: "#666", marginBottom: "2rem" }}>It&apos;s that simple.</p>

      {user ? (
        <section
          style={{
            padding: "1rem 1.25rem",
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#f9fafb",
          }}
        >
          <p style={{ margin: 0, color: "#16a34a", fontWeight: 600 }}>
            ✓ Signed in
          </p>
          <pre
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.85rem",
              background: "#fff",
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid #eee",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(user, null, 2)}
          </pre>
        </section>
      ) : (
        <Link
          href="/sign-in"
          style={{
            display: "inline-block",
            padding: "0.75rem 1.25rem",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Sign in →
        </Link>
      )}
    </main>
  );
}
