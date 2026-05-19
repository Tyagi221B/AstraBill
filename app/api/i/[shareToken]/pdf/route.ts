/**
 * GET /api/i/[shareToken]/pdf — public PDF download.
 *
 * The share token IS the auth; no `requireUser`. Streams `application/pdf`
 * inline so the customer's browser opens its viewer (mobile lets them save
 * or share from there). `private, no-store` keeps the per-customer PDF off
 * shared caches.
 */
import { NextResponse } from "next/server";

import { route } from "@/lib/http";
import { renderPublicInvoicePdfByToken } from "@/lib/services/invoice-pdf";

export const GET = route(
  async (_req, ctx: { params: Promise<{ shareToken: string }> }) => {
    const { shareToken } = await ctx.params;
    const { bytes, filename } = await renderPublicInvoicePdfByToken(shareToken);

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
