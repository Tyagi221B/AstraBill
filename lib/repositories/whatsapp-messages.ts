/**
 * WhatsApp-messages repository — the only place Drizzle queries the
 * `whatsapp_messages` table. The send service owns the lifecycle:
 *
 *   1. insert (status="queued")  →
 *   2. call Meta Cloud API       →
 *   3. markSent / markFailed     (status follows the API result)
 *
 * Webhook updates (delivered / read) are a future write path; the columns
 * `delivered_at` and `read_at` are reserved for them.
 *
 * No business rules here — scope by `business_id` / `document_id` only.
 */
import "server-only";
import { desc, eq } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewWhatsappMessage,
  type WhatsappMessage,
  whatsappMessages,
} from "../db/schema";

export async function insertWhatsAppMessage(
  exec: Tx | typeof db,
  values: NewWhatsappMessage,
): Promise<WhatsappMessage> {
  const [row] = await exec.insert(whatsappMessages).values(values).returning();
  if (!row) throw new Error("Insert whatsapp message returned no row");
  return row;
}

/** Stamp a queued row as sent, with Meta's wamid and the send timestamp. */
export async function markWhatsAppMessageSent(
  exec: Tx | typeof db,
  id: string,
  patch: { messageId: string; sentAt: Date },
): Promise<WhatsappMessage> {
  const [row] = await exec
    .update(whatsappMessages)
    .set({
      status: "sent",
      messageId: patch.messageId,
      sentAt: patch.sentAt,
      errorMessage: null,
    })
    .where(eq(whatsappMessages.id, id))
    .returning();
  if (!row) throw new Error("Mark whatsapp message sent returned no row");
  return row;
}

/** Stamp a queued row as failed, preserving the Meta error message. */
export async function markWhatsAppMessageFailed(
  exec: Tx | typeof db,
  id: string,
  patch: { errorMessage: string },
): Promise<WhatsappMessage> {
  const [row] = await exec
    .update(whatsappMessages)
    .set({
      status: "failed",
      errorMessage: patch.errorMessage,
    })
    .where(eq(whatsappMessages.id, id))
    .returning();
  if (!row) throw new Error("Mark whatsapp message failed returned no row");
  return row;
}

/**
 * Message rows for a document, newest first. Drives the resend UI ("last
 * sent · …") and any future history list. Includes failed sends — the
 * operator should see them too. WhatsApp messages are immutable history;
 * there is no soft-delete to filter on.
 */
export async function listWhatsAppMessagesForDocument(
  documentId: string,
): Promise<WhatsappMessage[]> {
  return db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.documentId, documentId))
    .orderBy(desc(whatsappMessages.createdAt));
}
