/**
 * Kpi — a single headline figure in a card: a small uppercase label, a big
 * tabular-nums value, an optional hint line. Used on the dashboard and the
 * customer detail page.
 *
 * Phase 2E: the `warning` value used to render in bright `text-destructive`
 * red (`#dc2626`). On warm paper that read as "alarm" — too loud for "money
 * owed". Softened to `text-red-700` (`#b91c1c`) — composed-but-important,
 * not screaming. `success` similarly composed at `text-green-700`.
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
            tone === "warning" && "text-red-700 dark:text-red-400",
            tone === "success" && "text-green-700 dark:text-green-400",
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
