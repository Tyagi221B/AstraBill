/**
 * GET /api/invoices/[id]/pdf — render the invoice to a branded PDF.
 *
 * Streams `application/pdf` bytes inline (the browser opens its viewer; the
 * user saves from there). Membership-scoped via the service — a non-visible
 * invoice is a 404. Always fresh: drafts are mutable, so no caching.
 */
import { NextResponse } from "next/server";

import { route } from "@/lib/http";
import { renderInvoicePdf } from "@/lib/services/invoice-pdf";
import { requireUser } from "@/lib/session";

export const GET = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { bytes, filename } = await renderInvoicePdf(id, user.id);

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  },
);
