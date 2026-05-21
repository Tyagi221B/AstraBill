/**
 * SEO helpers — one place that knows the site's canonical identity.
 *
 * `pageMetadata()` builds a Next `Metadata` object with sane Open Graph /
 * Twitter defaults; pages pass only what differs. `landingPageJsonLd()`
 * returns the @graph JSON-LD the landing page embeds.
 */
import type { Metadata } from "next";

/** Canonical production origin (apex 301s to www). */
export const SITE_URL = "https://www.astrabill.com";

export const SITE_NAME = "AstraBill";
export const SITE_TAGLINE = "GST billing for Indian businesses";
export const COMPANY = "Opryon Labs";

export const SITE_DESCRIPTION =
  "AstraBill is GST invoicing for Indian SMEs — raise a bill, send it on " +
  "WhatsApp with a UPI payment link, and get paid. No training, no desktop " +
  "software. By Opryon Labs.";

export const OG_IMAGE = `${SITE_URL}/astrabill-logo-primary.webp`;

export const KEYWORDS = [
  "GST billing software India",
  "GST invoice app",
  "WhatsApp invoice",
  "UPI payment link invoice",
  "billing software for small business India",
  "GST invoicing for traders",
  "online billing India",
  "free GST invoice maker",
  "invoice on WhatsApp",
  "SME billing software",
  "AstraBill",
  "Opryon Labs",
];

export function pageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
}: {
  title?: string;
  description?: string;
  path?: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  const resolvedTitle = title
    ? `${title} · ${SITE_NAME}`
    : `${SITE_NAME} — ${SITE_TAGLINE}`;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_IN",
      title: resolvedTitle,
      description,
      url,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}

/** schema.org @graph — Organization + SoftwareApplication + WebSite. */
export function landingPageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        legalName: `${SITE_NAME} by ${COMPANY}`,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        logo: OG_IMAGE,
        parentOrganization: { "@type": "Organization", name: COMPANY },
        areaServed: "IN",
        sameAs: [
          "https://www.opryon.com",
        ],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: "en-IN",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
          priceValidUntil: "2027-12-31",
          description: "Free plan — 20 invoices a month",
        },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en-IN",
      },
    ],
  };
}

/** @deprecated Use landingPageJsonLd instead. */
export const organizationJsonLd = landingPageJsonLd;
