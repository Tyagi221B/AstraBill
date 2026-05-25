import type { Metadata } from "next";

import { ComingSoon } from "../_components/ComingSoon";

export const metadata: Metadata = { title: "Print Settings" };

export default function PrintSettingsPage() {
  return (
    <ComingSoon
      title="Print Settings"
      description="Choose your invoice template, brand colour, fonts, paper size, and which columns appear on the printed bill. For now, the Branding page in the Advanced tray covers template + colour + font + columns."
    />
  );
}
