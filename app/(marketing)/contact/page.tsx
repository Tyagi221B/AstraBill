import { Container } from "@/components/ui/Container";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact",
  description: "Get in touch with the AstraBill team at Opryon Labs.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Contact us
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Questions about AstraBill, billing, or your account — we&rsquo;re
          happy to help.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-card-foreground">
              Email
            </h2>
            <a
              href="mailto:hello@astrabill.com"
              className="mt-1.5 inline-block text-primary hover:underline"
            >
              hello@astrabill.com
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              We aim to reply within one working day.
            </p>
          </div>

          <div className="rounded-card border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-card-foreground">
              Operated by
            </h2>
            <p className="mt-1.5 text-sm text-foreground">Opryon Labs</p>
            <p className="mt-2 text-sm text-muted-foreground">
              AstraBill is a product of Opryon Labs, India.
            </p>
          </div>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          For billing or refund queries, please write from your registered
          email so we can verify your account quickly. See our{" "}
          <a className="text-primary hover:underline" href="/refund">
            Refund &amp; Cancellation Policy
          </a>
          .
        </p>
      </div>
    </Container>
  );
}
