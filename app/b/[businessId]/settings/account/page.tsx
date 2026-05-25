import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <ComingSoon
      title="Account"
      description="Edit your name, email, and password. We're building this — for now you can change account-level details from your sign-in provider."
    />
  );
}
