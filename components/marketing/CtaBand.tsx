import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export function CtaBand() {
  return (
    <section className="py-24 sm:py-28">
      <Container>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-15 blur-3xl"
            style={{
              backgroundImage:
                "linear-gradient(120deg, var(--brand-from), var(--brand-to))",
            }}
          />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
            Send your first invoice today
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Free to start, nothing to install. If you can use WhatsApp, you can
            use AstraBill.
          </p>
          <div className="relative mt-8 flex justify-center">
            <Link href="/sign-in" className={buttonClasses("primary", "lg")}>
              Get started — it&apos;s free
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
