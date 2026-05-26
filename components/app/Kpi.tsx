/**
 * Kpi — a single headline figure in a card: a small uppercase label,
 * a big tabular-nums value, an optional hint, and an optional icon hint.
 *
 * Tones map onto the semantic colour family from globals.css:
 *   - success → emerald  (money received, paid)
 *   - warning → amber    (needs action, outstanding to collect)
 *   - danger  → red      (overdue, voided)
 *   - info    → blue     (neutral informational)
 *   - brand   → indigo   (revenue, top-of-business figures)
 *   - neutral → muted    (counts, generic figures)
 *
 * Each tinted tone paints a soft background wash, a 2px coloured top
 * stripe, and matches the icon + value colour to the bold semantic. The
 * card lifts subtly on hover for a sense of clickability even when the
 * tile itself isn't a link (the lift just communicates "this matters").
 *
 * Used by the dashboard's KPI row and the customer-detail page.
 */
import type { ComponentType } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "brand";

type IconType = ComponentType<{ className?: string }>;

interface ToneStyles {
  card: string;
  stripe: string;
  icon: string;
  value: string;
}

const TONE: Record<KpiTone, ToneStyles> = {
  neutral: {
    card: "",
    stripe: "",
    icon: "text-muted-foreground",
    value: "text-foreground",
  },
  success: {
    card: "bg-success-soft border-success/20",
    stripe: "bg-success",
    icon: "text-success",
    value: "text-success",
  },
  warning: {
    card: "bg-warning-soft border-warning/25",
    stripe: "bg-warning",
    icon: "text-warning",
    value: "text-warning",
  },
  danger: {
    card: "bg-danger-soft border-danger/20",
    stripe: "bg-danger",
    icon: "text-danger",
    value: "text-danger",
  },
  info: {
    card: "bg-info-soft border-info/20",
    stripe: "bg-info",
    icon: "text-info",
    value: "text-info",
  },
  brand: {
    card: "bg-accent border-primary/20",
    stripe: "bg-primary",
    icon: "text-primary",
    value: "text-foreground",
  },
};

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  icon?: IconType;
}) {
  const t = TONE[tone];

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        t.card,
      )}
    >
      {tone !== "neutral" && (
        <div
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-0.5", t.stripe)}
        />
      )}
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {Icon && <Icon className={cn("h-4 w-4 shrink-0", t.icon)} />}
        </div>
        <div className={cn("mt-1.5 text-2xl font-bold tabular-nums", t.value)}>
          {value}
        </div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground/80">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
