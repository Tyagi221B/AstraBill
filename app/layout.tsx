import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { PostHogIdentify } from "@/components/PostHogIdentify";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import {
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
  applicationName: SITE_NAME,
  authors: [{ name: "Opryon Labs" }],
  creator: "Opryon Labs",
  // Icons come from app/icon.png + app/apple-icon.png (Next file convention).
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PostHog identify needs the user; the root layout is the one place that
  // sees every page load. NextAuth's auth() is per-request cached.
  const user = await getSessionUser();

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
          {user && (
            <PostHogIdentify
              userId={user.id}
              email={user.email}
              name={user.name}
            />
          )}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
