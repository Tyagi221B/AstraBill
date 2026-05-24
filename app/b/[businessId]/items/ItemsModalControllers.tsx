"use client";
/**
 * Client controllers that wrap ItemFormModal for the items list page.
 *
 *   ItemsCreateController — renders the "+ New item" button and opens the
 *     create modal in local state. Also auto-opens if server passed
 *     `initialOpen=true` (from the /items/new redirect → ?create=1 URL).
 *
 *   ItemsEditController — pure modal for editing a known item. Mounted by
 *     the server only when ?edit=<id> resolves to a real item; on close it
 *     clears the query so the modal unmounts on next render.
 */
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { buttonClasses } from "@/components/ui/Button";
import type { ItemCategory, ItemUnit } from "@/lib/db/schema";

import { ItemFormModal, type ItemFormInitial } from "./ItemFormModal";

export function ItemsCreateController({
  businessId,
  units,
  initialCategories,
  initialOpen = false,
  label,
  variant = "primary",
}: {
  businessId: string;
  units: ItemUnit[];
  initialCategories: ItemCategory[];
  initialOpen?: boolean;
  label: string;
  variant?: "primary" | "outline";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(initialOpen);

  function close() {
    setOpen(false);
    if (initialOpen) {
      // Clear ?create=1 so refresh doesn't re-open.
      router.replace(pathname, { scroll: false });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClasses(variant, "sm")}
      >
        <Plus className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <ItemFormModal
          businessId={businessId}
          units={units}
          initialCategories={initialCategories}
          onClose={close}
        />
      )}
    </>
  );
}

export function ItemsEditController({
  businessId,
  units,
  initialCategories,
  editingItemId,
  initial,
}: {
  businessId: string;
  units: ItemUnit[];
  initialCategories: ItemCategory[];
  editingItemId: string;
  initial: ItemFormInitial;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function close() {
    router.replace(pathname, { scroll: false });
  }

  return (
    <ItemFormModal
      businessId={businessId}
      units={units}
      initialCategories={initialCategories}
      editingItemId={editingItemId}
      initial={initial}
      onClose={close}
    />
  );
}
