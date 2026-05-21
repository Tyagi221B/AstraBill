import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft brand glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -top-24 h-112 w-176 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          backgroundImage:
            "linear-gradient(120deg, var(--brand-from), var(--brand-to))",
        }}
      />
      <Container className="relative flex flex-col items-center py-24 text-center sm:py-32">
        <Logo variant="brandmark" priority className="h-20 w-auto" />

        <p className="mt-8 inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1 text-xs font-medium text-muted-foreground">
          GST invoicing · WhatsApp delivery · UPI payments
        </p>

        <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          Billing built for the shop owner —{" "}
          <span className="text-brand-gradient">not the accountant.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Raise a GST invoice, send it on WhatsApp with a UPI payment link, and
          watch it get paid. No training, no desktop software.
        </p>

        <p className="mt-4 text-sm font-semibold text-foreground/70">
          Tally for your CA. AstraBill for you.
        </p>

        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/sign-in" className={buttonClasses("primary", "lg")}>
            Get started — it&apos;s free
          </Link>
          <Link href="/#how" className={buttonClasses("outline", "lg")}>
            See how it works
          </Link>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Free plan — 20 invoices a month. No card needed.
        </p>
      </Container>
    </section>
  );
}
