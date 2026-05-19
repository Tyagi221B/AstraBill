import { Boxes, Receipt, ShieldCheck, Wallet } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { UpiIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Container } from "@/components/ui/Container";

type FeatureIcon = ComponentType<SVGProps<SVGSVGElement>>;

// `brand:true` icons keep their native colours (WhatsApp green, UPI orange/
// green) — that's the trust signal. `brand:false` icons inherit
// `text-primary` from the tile and stay on-token.
const FEATURES: {
  title: string;
  body: string;
  Icon: FeatureIcon;
  brand?: boolean;
}[] = [
  {
    title: "GST done right",
    body: "CGST/SGST/IGST, HSN summaries, dual-unit lines and round-off — computed for you. No accountant needed to raise a bill.",
    Icon: Receipt,
  },
  {
    title: "WhatsApp delivery",
    body: "Send the invoice as a PDF straight to your customer's WhatsApp — where they actually read it. 98% open rate.",
    Icon: WhatsAppIcon,
    brand: true,
  },
  {
    title: "UPI payment links",
    body: "Every invoice carries a UPI payment link. The customer taps, pays, and the invoice reconciles itself.",
    Icon: UpiIcon,
    brand: true,
  },
  {
    title: "Udhaar tracker",
    body: "Know who owes you what, at a glance. Automated reminders nudge slow payers without the awkward phone call.",
    Icon: Wallet,
  },
  {
    title: "Inventory built in",
    body: "Products, stock and low-stock alerts. Stock moves the moment an invoice is finalised — no separate ledger.",
    Icon: Boxes,
  },
  {
    title: "Proper roles",
    body: "A salesman can raise a bill but never sees your margins. Real role-based access, not an afterthought.",
    Icon: ShieldCheck,
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
          {FEATURES.map(({ title, body, Icon, brand }) => (
            <div
              key={title}
              className="rounded-card border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div
                className={
                  brand
                    ? "inline-flex size-11 items-center justify-center rounded-lg bg-muted text-2xl"
                    : "inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"
                }
              >
                <Icon
                  className={brand ? "size-6" : "size-5"}
                  strokeWidth={brand ? undefined : 2}
                  aria-hidden
                />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-card-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
