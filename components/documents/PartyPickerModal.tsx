"use client";
/**
 * PartyPickerModal — overlay dialog for picking the Bill-to / Bill-from
 * party on a document. Mirrors myBillBook's pattern:
 *
 *   [search input]                      ← autofocused
 *   ─────────────────────────────
 *   Party Name              Balance     ← table header
 *   Asmit                   ₹32,000 ↑   ← positive = receivable (red ↑)
 *   shubh                   ₹10,000 ↓   ← negative = payable    (green ↓)
 *   …
 *   ─────────────────────────────
 *   [ + Create Party ]                  ← opens nested QuickAddPartyModal
 *
 * Balance comes pre-computed from `listPartiesWithBalanceForUser`. Search
 * filters by name OR mobile (substring, case-insensitive). On select, the
 * parent receives the full party row and closes the modal.
 *
 * Create Party uses a lightweight quick-add (Name + Mobile + GSTIN); for
 * the full party form, link to /parties/new from there.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import Decimal from "decimal.js";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Party } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export type PickerParty = Party & { balance: string };

const inr = (n: string | Decimal) =>
  new Decimal(n).abs().toNumber().toLocaleString("en-IN");

/* ------------------------------------------------------------------ */
/* PartyPickerModal                                                    */
/* ------------------------------------------------------------------ */

export function PartyPickerModal({
  businessId,
  parties,
  onSelect,
  onClose,
  onPartyCreated,
  defaultType,
}: {
  businessId: string;
  parties: PickerParty[];
  /** Called with the chosen party. Parent closes the modal. */
  onSelect: (party: PickerParty) => void;
  onClose: () => void;
  /** Called after a successful quick-add so the parent can append to its
   *  parties list. The picker will auto-select the new party. */
  onPartyCreated: (party: PickerParty) => void;
  /** Default `type` for the quick-add form ("customer" for sales docs,
   *  "supplier" for purchase docs). */
  defaultType: Party["type"];
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Esc closes the modal.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !creating) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, creating]);

  // Autofocus the search input on mount.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => {
      const name = p.name.toLowerCase();
      const mobile = (p.mobileNumber ?? "").toLowerCase();
      return name.includes(q) || mobile.includes(q);
    });
  }, [parties, query]);

  function handleCreated(party: PickerParty) {
    onPartyCreated(party);
    onSelect(party);
    setCreating(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="party-picker-title"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <h2 id="party-picker-title" className="sr-only">
              Pick a party
            </h2>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search party by name or number"
                className="pl-9"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Party Name</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    {parties.length === 0
                      ? "No parties yet — create one below."
                      : `No matches for “${query}”.`}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <PartyRow key={p.id} party={p} onSelect={onSelect} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* + Create Party CTA */}
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-primary/60 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
          >
            <Plus className="h-4 w-4" />
            Create Party
          </button>
        </div>
      </div>

      {creating && (
        <QuickAddPartyModal
          businessId={businessId}
          defaultType={defaultType}
          onCreated={handleCreated}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function PartyRow({
  party,
  onSelect,
}: {
  party: PickerParty;
  onSelect: (p: PickerParty) => void;
}) {
  const bal = new Decimal(party.balance || "0");
  const isZero = bal.isZero();
  const isReceivable = bal.gt(0); // they owe us
  return (
    <tr
      onClick={() => onSelect(party)}
      className="cursor-pointer border-t border-border hover:bg-muted/60"
    >
      <td className="px-4 py-3 font-medium text-foreground">{party.name}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        {isZero ? (
          <span className="text-muted-foreground">₹ 0</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              isReceivable
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            ₹ {inr(bal)}
            {isReceivable ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* QuickAddPartyModal — minimal create form                            */
/* ------------------------------------------------------------------ */

function QuickAddPartyModal({
  businessId,
  defaultType,
  onCreated,
  onClose,
}: {
  businessId: string;
  defaultType: Party["type"];
  onCreated: (party: PickerParty) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          type: defaultType,
          name: trimmed,
          mobileNumber: mobile.trim() || null,
          gstin: gstin.trim().toUpperCase() || null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: Party }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(`Added “${json.data.name}”`);
      onCreated({ ...json.data, balance: "0" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create party",
      );
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-party-title"
    >
      <div
        className="w-full max-w-md rounded-lg bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="quick-add-party-title" className="text-base font-semibold">
            Create {defaultType === "supplier" ? "supplier" : "customer"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-party-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quick-party-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Party name"
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-party-mobile">Mobile</Label>
            <Input
              id="quick-party-mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="10-digit number"
              inputMode="tel"
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-party-gstin">GSTIN</Label>
            <Input
              id="quick-party-gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              onKeyDown={onKeyDown}
              placeholder="15-char GSTIN (optional)"
              className="font-mono"
              maxLength={15}
              disabled={busy}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            For more fields (address, credit terms, opening balance), use the
            full party form after creating.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={submit}
            disabled={busy || !name.trim()}
          >
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
