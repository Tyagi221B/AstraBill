/**
 * Meta Cloud API implementation of IWhatsAppProvider.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 * Auth: Bearer access token tied to a Meta app + phone number id.
 */
import "server-only";
import { AppError } from "../errors";
import { toMetaPhone } from "../phone";
import type {
  IWhatsAppProvider,
  SendTemplateArgs,
  SendTemplateResult,
} from "./types";

const GRAPH_VERSION = "v21.0";

export class MetaWhatsAppProvider implements IWhatsAppProvider {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
  ) {}

  async sendTemplate(args: SendTemplateArgs): Promise<SendTemplateResult> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`;
    const components: unknown[] = [];
    if (args.bodyVars?.length) {
      components.push({ type: "body", parameters: args.bodyVars });
    }
    if (args.buttonVars?.length) {
      for (const b of args.buttonVars) {
        components.push({
          type: "button",
          sub_type: "url",
          index: String(b.index),
          parameters: b.parameters,
        });
      }
    }
    const payload = {
      messaging_product: "whatsapp",
      to: toMetaPhone(args.to),
      type: "template",
      template: {
        name: args.template,
        language: { code: args.language ?? "en" },
        ...(components.length ? { components } : {}),
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AppError(`WhatsApp send failed (HTTP ${res.status})`, {
        status: 502,
        code: "WHATSAPP_SEND_FAILED",
        details: { meta: body.slice(0, 500) },
      });
    }
    const json = (await res.json()) as { messages?: { id?: string }[] };
    const messageId = json.messages?.[0]?.id;
    if (!messageId) {
      throw new AppError("WhatsApp send returned no message id", {
        status: 502,
        code: "WHATSAPP_SEND_FAILED",
      });
    }
    return { messageId };
  }
}
