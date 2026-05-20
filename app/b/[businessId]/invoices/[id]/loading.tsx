/**
 * Invoice detail loading shell. The detail page does four DB reads in
 * parallel — payments, WhatsApp sends, membership, customer — so the
 * skeleton matters more here than on the lists.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoiceDetailLoading() {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="mb-3 h-4 w-20" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3 w-32" />
              <Skeleton className="mt-2 h-3 w-48" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-5">
        <CardContent className="pt-6">
          <Skeleton className="mb-4 h-5 w-24" />
          <div className="flex flex-col">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-t border-border py-3 first:border-t-0"
              >
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
