"use client";
/**
 * WhatsAppPanel — send the `astrabill_invoice_v1` template to the document's
 * party and show the send history.
 *
 * Shown only on finalised sales invoices (the server gates that). Sends POST
 * to /api/documents/[id]/send-whatsapp. After a successful send the page
 * reloads so the server re-derives the history list — the panel never
 * mutates its own state list (rows are owned by the service).
 */
import { useState } from "react";
import posthog from "posthog-js";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";

interface SendRow {
  id: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  toPhone: string;
  sentAt: string | null; // ISO
  createdAt: string; // ISO
  errorMessage: string | null;
}

const STATUS_TONE: Record<
  SendRow["status"],
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  queued: "neutral",
  sent: "info",
  delivered: "info",
  read: "success",
  failed: "destructive",
};

const STATUS_LABEL: Record<SendRow["status"], string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Mask phone for display: keep country code + last 4. */
function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  const cc = phone.startsWith("+91") ? "+91" : phone.slice(0, 3);
  const last4 = phone.slice(-4);
  return `${cc} ••••••${last4}`;
}

export function WhatsAppPanel({
  documentId,
  partyPhone,
  partyName,
  canSend,
  sends,
}: {
  documentId: string;
  partyPhone: string | null;
  partyName: string | null;
  canSend: boolean;
  sends: SendRow[];
}) {
  const [busy, setBusy] = useState(false);

  const lastSend = sends[0] ?? null;
  const hasSentBefore = sends.some((s) => s.status !== "failed");
  const noParty = partyName === null;
  const noPhone = !noParty && !partyPhone;
  const blocked = noParty || noPhone || !canSend;

  async function send() {
    if (busy) return;
    if (
      hasSentBefore &&
      !confirm(
        "Resend the invoice on WhatsApp? The customer will get another message.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/send-whatsapp`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { ok: true; data: { messageId: string; sentAt: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      posthog.capture("invoice_sent_whatsapp", {
        document_id: documentId,
        resend: hasSentBefore,
      });
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong",
      );
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold">WhatsApp</h2>
            {lastSend && (
              <Badge tone={STATUS_TONE[lastSend.status]}>
                {STATUS_LABEL[lastSend.status]}
              </Badge>
            )}
          </div>
          {!blocked && (
            <Button
              type="button"
              variant={hasSentBefore ? "outline" : "primary"}
              size="sm"
              onClick={send}
              disabled={busy}
            >
              {busy
                ? "Sending…"
                : hasSentBefore
                  ? "Resend on WhatsApp"
                  : "Send on WhatsApp"}
            </Button>
          )}
        </div>

        {/* ---- state line ---- */}
        <div className="mb-3 text-sm">
          {noParty ? (
            <p className="text-muted-foreground">
              Attach a party to this invoice to send it on WhatsApp.
            </p>
          ) : noPhone ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{partyName}</span>{" "}
              has no mobile number. Add one on the party to enable WhatsApp.
            </p>
          ) : !canSend ? (
            <p className="text-muted-foreground">
              Your role can't send WhatsApp messages.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Will deliver to{" "}
              <span className="font-medium text-foreground">{partyName}</span>{" "}
              at{" "}
              <span className="font-mono text-foreground/90">
                {maskPhone(partyPhone!)}
              </span>
              .
            </p>
          )}
        </div>

        {/* ---- history ---- */}
        {sends.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Send history
            </p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {sends.slice(0, 5).map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-muted-foreground">
                    {fmtDateTime(s.sentAt ?? s.createdAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    {s.status === "failed" && s.errorMessage && (
                      <span
                        className="max-w-xs truncate text-xs text-destructive"
                        title={s.errorMessage}
                      >
                        {s.errorMessage}
                      </span>
                    )}
                    <Badge tone={STATUS_TONE[s.status]}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
