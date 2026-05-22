/**
 * WhatsApp send service — the document "Send on WhatsApp" loop.
 *
 *   create sales invoice → finalise → "Send on WhatsApp"
 *     → share URL is the auth-free /i/[shareToken] view
 *     → Meta delivers the template message
 *     → wamid logged in `whatsapp_messages`
 *
 * The ONLY place that knows the binding between the `astrabill_invoice_v1`
 * template and the document fields. Body variables, in order, must match
 * the approved Meta template:
 *
 *   {{1}} party name        {{2}} document number
 *   {{3}} business name     {{4}} amount (no symbol — the template has ₹)
 *
 * URL button (index 0): the value we pass (the share_token) is APPENDED by
 * Meta to the template's static base URL `https://www.astrabill.com/i/` —
 * Meta's URL-button mechanism appends, it does not substitute. The base
 * must NOT contain `{{1}}` (a gotcha we hit on the v0 template).
 *
 * Scope: V1 ships WhatsApp send for SALES INVOICES only — the four template
 * variables (party / number / business / amount) are tuned for that one
 * artifact. Other doc types (quotation, credit note, purchase invoice) will
 * get their own template + send service when product calls for it.
 */
import "server-only";

import { db } from "../db";
import { type WhatsappMessage } from "../db/schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors";
import { getMembership, roleHas } from "../rbac";
import { findBusinessById } from "../repositories/businesses";
import { findPartyById } from "../repositories/parties";
import { getDocumentForUser } from "../repositories/documents";
import {
  insertWhatsAppMessage,
  listWhatsAppMessagesForDocument,
  markWhatsAppMessageFailed,
  markWhatsAppMessageSent,
} from "../repositories/whatsapp-messages";
import { whatsapp } from "../whatsapp";

const INVOICE_TEMPLATE = "astrabill_invoice_v1";
const INVOICE_TEMPLATE_LANG = "en";

/**
 * Meta rejects template body variables that contain newlines, tabs, or runs
 * of 4+ spaces (error 131008). Party / business names are user-controlled
 * and may contain incidental whitespace from paste, so the send path
 * normalises before handing to Meta. The stored value is left alone — this
 * is a transport-layer guard, not a data correction.
 */
function sanitizeTemplateVar(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export interface SendDocumentResult {
  messageId: string;
  sentAt: string;
}

/**
 * Send (or resend) the `astrabill_invoice_v1` template for one sales-invoice
 * document. Membership + `whatsapp:send` permission required. The document
 * must be finalised (it must have a number + share_token). The party must
 * have a mobile_number on file.
 *
 * Failure modes:
 *   - 404 NotFound        document missing OR caller isn't a member
 *   - 403 Forbidden       caller's role lacks `whatsapp:send`
 *   - 409 Conflict        wrong doc type, draft, or cancelled
 *   - 422 Validation      party has no mobile_number (cannot deliver)
 *   - 502 WhatsAppFailed  Meta API rejected the send (logged on the row)
 */
export async function sendDocumentOnWhatsApp(
  documentId: string,
  actorUserId: string,
): Promise<SendDocumentResult> {
  // 1. Auth — membership-scoped fetch (404 covers both not-found AND not-a-member).
  const document = await getDocumentForUser(actorUserId, documentId);
  if (!document) throw new NotFoundError("Document not found");

  // 2. Permission. Membership proven by step 1; this fails only on role.
  const membership = await getMembership(actorUserId, document.businessId);
  if (!membership || !roleHas(membership.role, "whatsapp:send")) {
    throw new ForbiddenError("Your role cannot send WhatsApp messages");
  }

  // 3. Template is sales-invoice-shaped — refuse other doc types until they
  //    get their own template binding.
  if (document.docType !== "sales_invoice") {
    throw new ConflictError(
      "WhatsApp send is only available for sales invoices in V1.",
    );
  }

  // 4. Draft / cancelled have no number or no longer reflect a live total.
  if (
    document.status === "draft" ||
    document.status === "cancelled" ||
    document.docNumber === null ||
    document.shareToken === null
  ) {
    throw new ConflictError(
      "Finalise the invoice before sending it on WhatsApp.",
    );
  }

  // 5. Party must have a phone.
  const party = await findPartyById(document.partyId);
  if (!party) {
    throw new NotFoundError("Party not found");
  }
  if (!party.mobileNumber) {
    throw new ValidationError(
      "Add a mobile number to this party before sending on WhatsApp.",
    );
  }

  const business = await findBusinessById(document.businessId);
  if (!business) {
    throw new NotFoundError("Business not found");
  }

  // 6. Insert the queued log row. Used by the resend UI even before the API
  //    call returns, and surfaces a failed row if the API throws below.
  const queued = await insertWhatsAppMessage(db, {
    businessId: business.id,
    documentId: document.id,
    toPhone: party.mobileNumber,
    templateName: INVOICE_TEMPLATE,
    status: "queued",
  });

  // 7. Send. External IO — outside any transaction.
  try {
    const result = await whatsapp.sendTemplate({
      to: party.mobileNumber,
      template: INVOICE_TEMPLATE,
      language: INVOICE_TEMPLATE_LANG,
      bodyVars: [
        { type: "text", text: sanitizeTemplateVar(party.name) },
        { type: "text", text: sanitizeTemplateVar(document.docNumber) },
        { type: "text", text: sanitizeTemplateVar(business.name) },
        { type: "text", text: sanitizeTemplateVar(document.grandTotal) },
      ],
      buttonVars: [
        {
          index: 0,
          parameters: [{ type: "text", text: document.shareToken }],
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
 * Membership-scoped read of the WhatsApp send log for a document. Powers the
 * "last sent / resend" indicator on the sales-invoice detail page.
 */
export async function listDocumentWhatsAppSends(
  documentId: string,
  actorUserId: string,
): Promise<WhatsappMessage[]> {
  const document = await getDocumentForUser(actorUserId, documentId);
  if (!document) throw new NotFoundError("Document not found");
  return listWhatsAppMessagesForDocument(documentId);
}
