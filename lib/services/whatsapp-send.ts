/**
 * WhatsApp send service — the invoice "Send on WhatsApp" loop.
 *
 *   create invoice → finalise → "Send on WhatsApp"
 *     → PDF rendered (the share URL the template button points at)
 *     → Meta delivers the template message
 *     → wamid logged in `whatsapp_messages`
 *
 * This file is the ONLY place that knows the binding between the
 * `astrabill_invoice_v1` template and the invoice fields. Body variables,
 * in order, must match the approved Meta template:
 *
 *   {{1}} customer name      {{2}} invoice number
 *   {{3}} business name      {{4}} amount (no symbol — the template has ₹)
 *
 * URL button (index 0): the value we pass (the share_token) is APPENDED
 * by Meta to the template's static base URL `https://www.astrabill.com/i/`
 * — Meta's URL-button mechanism appends, it does not substitute. The base
 * must NOT contain `{{1}}` (a gotcha we hit on the v0 template).
 *
 * Lazy backfill: invoices finalised BEFORE Phase 2B have `share_token = NULL`.
 * The first send for such an invoice generates and persists a token. Done with
 * a conditional UPDATE so two concurrent sends can't write two tokens.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db";
import { invoices, type WhatsappMessage } from "../db/schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors";
import { getMembership, roleHas } from "../rbac";
import { findBusinessById } from "../repositories/businesses";
import { findCustomerById } from "../repositories/customers";
import { getInvoiceForUser } from "../repositories/invoices";
import {
  insertWhatsAppMessage,
  listWhatsAppMessagesForInvoice,
  markWhatsAppMessageFailed,
  markWhatsAppMessageSent,
} from "../repositories/whatsapp-messages";
import { generateShareToken } from "../share-token";
import { whatsapp } from "../whatsapp";

const INVOICE_TEMPLATE = "astrabill_invoice_v1";
const INVOICE_TEMPLATE_LANG = "en";

/**
 * Meta rejects template body variables that contain newlines, tabs, or runs
 * of 4+ spaces (error 131008). Customer / business names are user-controlled
 * and may contain incidental whitespace from paste, so the send path
 * normalises before handing to Meta. The stored value is left alone — this
 * is a transport-layer guard, not a data correction.
 */
function sanitizeTemplateVar(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export interface SendInvoiceResult {
  messageId: string;
  sentAt: string;
}

/**
 * Send (or resend) the `astrabill_invoice_v1` template for one invoice. Membership
 * + `whatsapp:send` permission required. The invoice must be finalised — a
 * draft is not an issued document and has no number to send. The customer
 * must have a phone on file.
 *
 * Failure modes:
 *   - 404 NotFound        invoice doesn't exist OR caller isn't a member
 *   - 403 Forbidden       caller's role lacks `whatsapp:send`
 *   - 409 Conflict        invoice is still a draft
 *   - 422 Validation      customer has no phone (cannot deliver)
 *   - 502 WhatsAppFailed  Meta API rejected the send (logged on the row)
 */
export async function sendInvoiceOnWhatsApp(
  invoiceId: string,
  actorUserId: string,
): Promise<SendInvoiceResult> {
  // 1. Auth — membership-scoped fetch (404 covers both not-found AND not-a-member).
  const invoice = await getInvoiceForUser(actorUserId, invoiceId);
  if (!invoice) throw new NotFoundError("Invoice not found");

  // 2. Permission. Membership is proven by step 1; this only fails on role.
  const membership = await getMembership(actorUserId, invoice.businessId);
  if (!membership || !roleHas(membership.role, "whatsapp:send")) {
    throw new ForbiddenError("Your role cannot send WhatsApp messages");
  }

  // 3. Drafts have no number, so the template body would be malformed. Refuse.
  if (invoice.status === "draft" || invoice.number === null) {
    throw new ConflictError(
      "Finalise the invoice before sending it on WhatsApp.",
    );
  }

  // 4. Customer must exist and have a phone.
  if (!invoice.customerId) {
    throw new ValidationError(
      "This invoice has no customer attached. Add one before sending.",
    );
  }
  const customer = await findCustomerById(invoice.customerId);
  if (!customer) {
    throw new NotFoundError("Customer not found");
  }
  if (!customer.phone) {
    throw new ValidationError(
      "Add a phone number to this customer before sending on WhatsApp.",
    );
  }

  const business = await findBusinessById(invoice.businessId);
  if (!business) {
    // The 404-style branch is fine here — the only way to land here is if
    // the business was soft-deleted between steps 1 and 5. Treat as gone.
    throw new NotFoundError("Business not found");
  }

  // 5. Lazy backfill: pre-2B finalised invoices have share_token = NULL.
  //    Conditional UPDATE so concurrent sends can't write two tokens.
  const shareToken = await ensureShareToken(invoice.id, invoice.shareToken);

  // 6. Insert the queued log row. Used by the resend UI even before the API
  //    call returns, and surfaces a failed row if the API throws below.
  const queued = await insertWhatsAppMessage(db, {
    businessId: business.id,
    invoiceId: invoice.id,
    toPhone: customer.phone,
    templateName: INVOICE_TEMPLATE,
    status: "queued",
  });

  // 7. Send. External IO — outside any transaction.
  try {
    const result = await whatsapp.sendTemplate({
      to: customer.phone,
      template: INVOICE_TEMPLATE,
      language: INVOICE_TEMPLATE_LANG,
      bodyVars: [
        { type: "text", text: sanitizeTemplateVar(customer.name) },
        { type: "text", text: sanitizeTemplateVar(invoice.number) },
        { type: "text", text: sanitizeTemplateVar(business.name) },
        { type: "text", text: sanitizeTemplateVar(invoice.total) },
      ],
      buttonVars: [
        {
          index: 0,
          parameters: [{ type: "text", text: shareToken }],
        },
      ],
    });
    const sentAt = new Date();
    await markWhatsAppMessageSent(db, queued.id, {
      messageId: result.messageId,
      sentAt,
    });
    return { messageId: result.messageId, sentAt: sentAt.toISOString() };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "WhatsApp send failed";
    await markWhatsAppMessageFailed(db, queued.id, {
      errorMessage: message.slice(0, 500),
    });
    if (cause instanceof AppError) throw cause;
    throw new AppError("WhatsApp send failed", {
      status: 502,
      code: "WHATSAPP_SEND_FAILED",
      cause,
    });
  }
}

/**
 * Membership-scoped read of the WhatsApp send log for an invoice. Powers the
 * "last sent / resend" indicator on the invoice detail page.
 */
export async function listInvoiceWhatsAppSends(
  invoiceId: string,
  actorUserId: string,
): Promise<WhatsappMessage[]> {
  const invoice = await getInvoiceForUser(actorUserId, invoiceId);
  if (!invoice) throw new NotFoundError("Invoice not found");
  return listWhatsAppMessagesForInvoice(invoiceId);
}

/**
 * Ensure the invoice has a `share_token`, generating one on first send for
 * invoices finalised before Phase 2B. Race-safe: the UPDATE only writes if
 * the column is still NULL; a concurrent caller that lost the race re-reads
 * the now-populated token. (Once non-null, the column is never changed.)
 */
async function ensureShareToken(
  invoiceId: string,
  currentToken: string | null,
): Promise<string> {
  if (currentToken) return currentToken;
  const candidate = generateShareToken();
  const updated = await db
    .update(invoices)
    .set({ shareToken: candidate })
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.shareToken)))
    .returning({ shareToken: invoices.shareToken });
  if (updated[0]?.shareToken) return updated[0].shareToken;
  // Lost the race — someone else backfilled it. Read it back.
  const [row] = await db
    .select({ shareToken: invoices.shareToken })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));
  if (!row?.shareToken) {
    throw new AppError("Failed to assign share token", {
      status: 500,
      code: "SHARE_TOKEN_BACKFILL_FAILED",
    });
  }
  return row.shareToken;
}
