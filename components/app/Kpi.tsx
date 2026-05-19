/**
 * Kpi — a single headline figure in a card: a small uppercase label, a big
 * tabular-nums value, an optional hint line. Used on the dashboard and the
 * customer detail page.
 *
 * `tone` colours the value: `warning` (red — money owed / a problem),
 * `success` (green — all clear / collected), `neutral` (default foreground).
 */
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1.5 text-2xl font-bold tabular-nums",
            tone === "warning" && "text-destructive",
            tone === "success" && "text-success",
          )}
        >
          {value}
        </div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground/70">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
