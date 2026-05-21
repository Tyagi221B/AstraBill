import { CtaBand } from "@/components/marketing/CtaBand";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Pricing } from "@/components/marketing/Pricing";
import { landingPageJsonLd, pageMetadata } from "@/lib/seo";

// Home keeps the root layout's default title verbatim (no template suffix).
export const metadata = pageMetadata({ path: "/" });

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // schema.org Organization — one JSON-LD block, server-rendered.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(landingPageJsonLd()),
        }}
      />
      <Hero />
      <FeatureGrid />
      <HowItWorks />
      <Pricing />
      <CtaBand />
    </>
  );
}
