/**
 * Marketing-site shell — Header + Footer wrap every public page (landing,
 * legal, contact, and the blog once it lands). The authed app pages live
 * outside this group and never inherit this chrome.
 *
 * The Header needs to know whether the visitor is signed in (to flip
 * "Sign in" → "Open app"). That session lookup is dynamic, but the rest
 * of the marketing chrome is fully static. Under cacheComponents we keep
 * the layout sync (so it's part of the static shell) and push the session
 * read into an async Header wrapped in Suspense — visitors see the
 * marketing chrome instantly, the "Sign in / Open app" button hydrates
 * in over the next tick.
 */
import { Suspense } from "react";

import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { getSessionUser } from "@/lib/session";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<Header isAuthed={false} />}>
        <HeaderAsync />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

async function HeaderAsync() {
  const user = await getSessionUser();
  return <Header isAuthed={Boolean(user)} />;
}
