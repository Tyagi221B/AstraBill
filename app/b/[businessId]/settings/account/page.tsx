/**
 * /b/[businessId]/settings/account — the caller's own user profile.
 *
 * Lives under the business-scoped settings rail purely for chrome (so the
 * left rail stays consistent) — the data is global to the user, not
 * business-scoped.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getUserById } from "@/lib/repositories/users";
import { requireUser } from "@/lib/session";

import { AccountForm } from "./AccountForm";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await requireUser();
  const user = await getUserById(session.id);
  if (!user) notFound();

  return (
    <AccountForm
      initial={{
        name: user.name ?? session.name ?? "",
        email: user.email ?? session.email ?? "",
        image: user.image ?? session.image ?? null,
      }}
    />
  );
}
