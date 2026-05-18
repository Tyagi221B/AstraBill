import { Container } from "@/components/ui/Container";

const STEPS: { step: string; title: string; body: string }[] = [
  {
    step: "01",
    title: "Create the invoice",
    body: "Pick a customer and products, or type a custom line. GST, totals and the invoice number are handled for you.",
  },
  {
    step: "02",
    title: "Send on WhatsApp",
    body: "One tap delivers the PDF to your customer's WhatsApp, with a UPI payment link built into the message.",
  },
  {
    step: "03",
    title: "Get paid",
    body: "The customer taps the link and pays. The invoice marks itself paid and the receipt goes back automatically.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-muted/40 py-24 sm:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From bill to paid, in one flow
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The whole loop — the demo that sells AstraBill.
          </p>
        </div>

        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.step}
              className="rounded-card border border-border bg-card p-7"
            >
              <span className="text-sm font-bold text-brand-gradient">
                {s.step}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-card-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
