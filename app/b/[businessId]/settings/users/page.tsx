import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "Manage Users" };

export default function ManageUsersPage() {
  return (
    <ComingSoon
      title="Manage Users"
      description="Invite teammates with role-based access (Owner, Manager, Cashier). Each role has its own permission set; the owner remains the only admin until V2 ships."
    />
  );
}
