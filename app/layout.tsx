import type { Metadata } from "next";

import { getSessionUser } from "@/lib/session";
import { PostHogIdentify } from "./PostHogIdentify";

export const metadata: Metadata = {
  title: "AstraBill",
  description: "Billing & payments for Indian businesses. It's that simple.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PostHog identify needs the user; the layout is the one place that sees
  // every authenticated page load. NextAuth's auth() is per-request cached,
  // so this adds at most one cookie read per nav.
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body>
        {user && (
          <PostHogIdentify
            userId={user.id}
            email={user.email}
            name={user.name}
          />
        )}
        {children}
      </body>
    </html>
  );
}
