/**
 * Skeleton recipes — Phase 2.0
 *
 * Dimension-matched placeholder compositions. Each one mirrors the exact
 * padding, height, gap, and structure of the live component it stands in
 * for, so the swap from skeleton → real content never shifts the layout
 * (zero CLS). Reach for these BEFORE composing one-off skeletons with
 * the bare Skeleton primitive — that's how layout shifts sneak in.
 *
 * Convention: every skeleton consumes the same props (`count` for lists,
 * `className` for outer overrides). All animations are tokenized through
 * the Skeleton primitive — no hard-coded colors live here.
 */
export { CardSkeleton } from "./CardSkeleton";
export { TableRowSkeleton } from "./TableRowSkeleton";
export { ListItemSkeleton } from "./ListItemSkeleton";
export { FormFieldSkeleton } from "./FormFieldSkeleton";
export { KpiTileSkeleton, KpiTileSkeletonRow } from "./KpiTileSkeleton";
export { AvatarSkeleton } from "./AvatarSkeleton";
export { PageHeaderSkeleton } from "./PageHeaderSkeleton";
export { FadeIn } from "./FadeIn";
