import { redirect } from "next/navigation";

import { routes } from "@/lib/routes";

/**
 * Legacy /items/[id]/edit route — Edit flow moved into a modal hosted by
 * the items list page. Redirect with ?edit=<id> so the modal auto-opens
 * after the server fetches that item.
 */
export default async function EditItemRedirect({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const { businessId, id } = await params;
  redirect(`${routes.b(businessId).items}?edit=${id}`);
}
