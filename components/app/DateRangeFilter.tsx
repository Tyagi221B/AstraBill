"use client";
/**
 * DateRangeFilter — From / To inputs that submit as `?from=…&to=…` query
 * params. Server pages re-render with the new bounds. Used by Sales /
 * Purchase Register, HSN Summary, GSTR-1, GSTR-3B.
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRangeFilter({
  initialFrom,
  initialTo,
}: {
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    router.push(`${url.pathname}${url.search}`);
  }

  return (
    <form onSubmit={onSubmit} className="mb-5 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="dr-from">From</Label>
        <Input
          id="dr-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="dr-to">To</Label>
        <Input
          id="dr-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <Button type="submit" variant="primary" size="sm">
        Apply
      </Button>
    </form>
  );
}

/** Current Indian FY bounds (Apr 1 .. Mar 31). */
export function currentFyBounds(): { from: string; to: string } {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  const startYear = month >= 4 ? year : year - 1;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}
