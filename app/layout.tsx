import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { PostHogIdentify } from "@/components/PostHogIdentify";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/Toaster";
import {
  KEYWORDS,
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/seo";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: "Opryon Labs", url: "https://www.opryon.com" }],
  creator: "Opryon Labs",
  publisher: "Opryon Labs",
  // Icons come from app/icon.png + app/apple-icon.png (Next file convention).
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: SITE_NAME,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Next 16: opt route transitions out of smooth scrolling while keeping
      // it for in-page anchor links (e.g. the landing's /#features hash).
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <ThemeProvider>
          {/*
            PostHog identify reads the session, which is dynamic per-request.
            Under cacheComponents, dynamic access in the root layout makes
            EVERY page dynamic — we lose all static-shell benefit.
            Pushing the await into an async leaf wrapped in Suspense keeps
            the root layout sync (cacheable) while still firing identify
            on every authed render. The fallback is `null` because the
            identify call has no visible UI.
          */}
          <Suspense fallback={null}>
            <PostHogIdentifyAsync />
          </Suspense>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

async function PostHogIdentifyAsync() {
  const user = await getSessionUser();
  if (!user) return null;
  return (
    <PostHogIdentify
      userId={user.id}
      email={user.email}
      name={user.name}
    />
  );
}
