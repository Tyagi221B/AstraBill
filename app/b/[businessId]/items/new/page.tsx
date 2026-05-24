import { redirect } from "next/navigation";

import { routes } from "@/lib/routes";

/**
 * Legacy /items/new route — Create flow moved into a modal hosted by the
 * items list page. Redirect with ?create=1 so the modal auto-opens.
 */
export default async function NewItemRedirect({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`${routes.b(businessId).items}?create=1`);
}
