/**
 * Generic loading shell for every business-scoped page.
 *
 * Next.js uses the *nearest* loading.tsx, so this fallback only applies to
 * pages that don't have their own. List pages, detail pages, and forms with
 * distinct shapes ship their own loading.tsx alongside their page.tsx so
 * the skeleton matches the real content's dimensions and CLS stays at zero.
 *
 * This generic fallback is just a defensive net: PageHeaderSkeleton +
 * a single 5-line CardSkeleton. Visually quiet, reads as "the system is
 * working" without committing to a specific content shape.
 */
import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui/skeletons";

export default function BusinessLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardSkeleton lines={5} />
    </>
  );
}
