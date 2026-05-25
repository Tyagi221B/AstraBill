import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Help & Support" };

export default function HelpPage() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <h2 className="text-xl font-semibold tracking-tight">Help & Support</h2>
        <p className="text-sm text-muted-foreground">
          Stuck on something? We&apos;re a small team — we read every email.
        </p>
        <ul className="space-y-2 text-sm">
          <li>
            <span className="text-muted-foreground">Email:</span>{" "}
            <a
              className="font-medium text-primary hover:underline"
              href="mailto:hello@astrabill.com"
            >
              hello@astrabill.com
            </a>
          </li>
          <li>
            <span className="text-muted-foreground">WhatsApp:</span>{" "}
            <span className="font-medium">Coming with V1 launch</span>
          </li>
          <li>
            <span className="text-muted-foreground">Docs:</span>{" "}
            <span className="font-medium">In progress</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
