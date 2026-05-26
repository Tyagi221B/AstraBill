/**
 * Dashboard loading shell — Phase 2.0 validation surface.
 *
 * Rebuilt on the new skeleton recipe library to prove the dimensions
 * line up with the real dashboard render. If you tune the dashboard's
 * KPI tile heights or the recent-invoices row count, update those
 * recipes once and every loading state benefits.
 *
 * Composition mirrors the live page: PageHeader + 3-KPI row +
 * recent-invoices card.
 */
import {
  CardSkeleton,
  KpiTileSkeletonRow,
  PageHeaderSkeleton,
} from "@/components/ui/skeletons";

export default function DashboardLoading() {
  return (
    <>
      <PageHeaderSkeleton titleWidth="w-48" />
      <KpiTileSkeletonRow count={3} className="mb-6" />
      <CardSkeleton lines={5} />
    </>
  );
}
