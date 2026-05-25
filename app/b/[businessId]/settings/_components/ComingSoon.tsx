/**
 * ComingSoon — the placeholder rendered at every V2 settings URL whose page
 * doesn't exist yet (Account, Invoice Settings, Print Settings, Manage
 * Users, Reminders, CA Reports Sharing, Pricing, Refer & Earn, Help).
 *
 * Keeping the rail links live (instead of disabled) means the IA stays
 * stable from day one: the URL where Manage Users will eventually land is
 * already reserved, so a deep link a teammate shares today won't break
 * after V2 ships.
 */
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 pt-6">
        <div className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">
          Coming soon
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
