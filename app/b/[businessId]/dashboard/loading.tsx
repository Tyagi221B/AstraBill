/**
 * Dashboard loading shell — three KPI cards + a recent-invoices placeholder.
 * Mirrors the live page's layout so the swap-in feels stable.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-32" />
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="pt-6">
          <Skeleton className="mb-4 h-5 w-40" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
