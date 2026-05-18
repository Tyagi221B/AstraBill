import { Container } from "@/components/ui/Container";

const FEATURES: { title: string; body: string }[] = [
  {
    title: "GST done right",
    body: "CGST/SGST/IGST, HSN summaries, dual-unit lines and round-off — computed for you. No accountant needed to raise a bill.",
  },
  {
    title: "WhatsApp delivery",
    body: "Send the invoice as a PDF straight to your customer's WhatsApp — where they actually read it. 98% open rate.",
  },
  {
    title: "UPI payment links",
    body: "Every invoice carries a UPI payment link. The customer taps, pays, and the invoice reconciles itself.",
  },
  {
    title: "Udhaar tracker",
    body: "Know who owes you what, at a glance. Automated reminders nudge slow payers without the awkward phone call.",
  },
  {
    title: "Inventory built in",
    body: "Products, stock and low-stock alerts. Stock moves the moment an invoice is finalised — no separate ledger.",
  },
  {
    title: "Proper roles",
    body: "A salesman can raise a bill but never sees your margins. Real role-based access, not an afterthought.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="py-24 sm:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a trading shop actually needs
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Not an accounting suite. The few things you do every day, done
            well.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-card border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <h3 className="text-lg font-semibold text-card-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
