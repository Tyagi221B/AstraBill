/**
 * SEO helpers — one place that knows the site's canonical identity.
 *
 * `pageMetadata()` builds a Next `Metadata` object with sane Open Graph /
 * Twitter defaults; pages pass only what differs. `organizationJsonLd()`
 * returns the JSON-LD the landing page embeds.
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
  // The root layout's title.template appends " · AstraBill"; the home page
  // passes no title and gets the layout default verbatim.
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`,
      description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`,
      description,
    },
  };
}

/** schema.org Organization — embedded as JSON-LD on the landing page. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    legalName: `${SITE_NAME} by ${COMPANY}`,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: `${SITE_URL}/astrabill-logo-primary.png`,
    parentOrganization: { "@type": "Organization", name: COMPANY },
    areaServed: "IN",
  };
}
