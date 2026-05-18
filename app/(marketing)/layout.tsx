/**
 * Marketing-site shell — Header + Footer wrap every public page (landing,
 * legal, contact, and the blog once it lands). The authed app pages live
 * outside this group and never inherit this chrome.
 */
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { getSessionUser } from "@/lib/session";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <Header isAuthed={Boolean(user)} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
