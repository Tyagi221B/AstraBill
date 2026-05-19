/**
 * PageHeader — the consistent title block at the top of every page that sits
 * inside the BrandedAppShell.
 *
 * Title + optional description on the left; an optional action slot on the
 * right (usually the page's primary "+ New …" button). Every business-scoped
 * page renders one of these so the chrome below the sidebar stays uniform —
 * same type scale, same spacing, same alignment.
 */
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {action}
        </div>
      )}
    </header>
  );
}
