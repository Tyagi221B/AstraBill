/**
 * Invoices list loading shell. Filter pill row + a few skeleton rows in a
 * card — matches the live page's layout for a stable swap-in.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoicesLoading() {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-32" />
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-16" />
        ))}
      </div>

      <Card>
        <CardContent className="px-0">
          <div className="flex flex-col">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 first:border-t-0"
              >
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
