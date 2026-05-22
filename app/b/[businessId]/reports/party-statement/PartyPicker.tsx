"use client";
/**
 * PartyPicker — dropdown that pushes the chosen party into ?partyId=…
 * Used by the Party Statement report page.
 */
import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";
import type { Party } from "@/lib/db/schema";

const SELECT_CLASS =
  "h-10 min-w-[16rem] rounded-md border border-input bg-background px-3 text-sm";

export function PartyPicker({
  parties,
  selectedId,
}: {
  parties: Party[];
  selectedId: string;
}) {
  const router = useRouter();

  function pick(partyId: string) {
    const url = new URL(window.location.href);
    if (partyId) url.searchParams.set("partyId", partyId);
    else url.searchParams.delete("partyId");
    router.push(`${url.pathname}${url.search}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="pp-party">Party</Label>
      <select
        id="pp-party"
        value={selectedId}
        onChange={(e) => pick(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">— select party —</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.type})
          </option>
        ))}
      </select>
    </div>
  );
}
