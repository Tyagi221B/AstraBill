import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AstraBill",
  description: "Billing & payments for Indian businesses. It's that simple.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
