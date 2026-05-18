import Link from "next/link";

import { buttonClasses } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

type Plan = {
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  blurb: string;
  features: string[];
  featured?: boolean;
};

// Mirrors DECISIONS.md → "Product — Pricing". V1 pricing.
const PLANS: Plan[] = [
  {
    name: "Free",
    priceMonthly: "₹0",
    priceAnnual: "always free",
    blurb: "Get billing off paper.",
    features: [
      "20 invoices / month",
      "GST invoicing + PDF",
      "Udhaar tracker",
      "Single user",
    ],
  },
  {
    name: "Starter",
    priceMonthly: "₹499",
    priceAnnual: "₹4,999 / year",
    blurb: "For the shop that sends bills daily.",
    features: [
      "Unlimited invoices",
      "200 WhatsApp sends / month",
      "UPI payment links",
      "Inventory tracking",
    ],
  },
  {
    name: "Pro",
    priceMonthly: "₹999",
    priceAnnual: "₹9,999 / year",
    blurb: "For a growing team.",
    features: [
      "1,000 WhatsApp sends / month",
      "Automated payment reminders",
      "Multi-user with roles",
      "Everything in Starter",
    ],
    featured: true,
  },
  {
    name: "Business",
    priceMonthly: "₹1,999",
    priceAnnual: "₹19,999 / year",
    blurb: "For multi-location operators.",
    features: [
      "Unlimited WhatsApp sends",
      "Multi-location",
      "Full role-based access",
      "Everything in Pro",
    ],
  },
];

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-primary"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Pricing that fits a small shop
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free. Upgrade when WhatsApp billing starts paying for itself.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-card border bg-card p-6 ${
                plan.featured
                  ? "border-primary shadow-lg shadow-primary/10"
                  : "border-border"
              }`}
            >
              {plan.featured && (
                <span className="mb-3 inline-flex w-fit rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-card-foreground">
                {plan.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-card-foreground">
                  {plan.priceMonthly}
                </span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {plan.priceAnnual}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/sign-in"
                className={`mt-7 ${buttonClasses(
                  plan.featured ? "primary" : "outline",
                  "md",
                  "w-full",
                )}`}
              >
                {plan.name === "Free" ? "Start free" : `Choose ${plan.name}`}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          WhatsApp sends beyond your plan: ₹0.20 / message. Annual billing
          saves two months.
        </p>
      </Container>
    </section>
  );
}
