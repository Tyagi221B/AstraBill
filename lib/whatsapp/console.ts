/**
 * Console implementation of IWhatsAppProvider — used in development when Meta
 * credentials aren't set, and in tests. Prints the would-be message to stdout
 * (including the OTP code) so the dev can copy it without a real WhatsApp send.
 *
 * NEVER use this in production — that's enforced in ./index.ts.
 */
import { randomUUID } from "node:crypto";
import type {
  IWhatsAppProvider,
  SendTemplateArgs,
  SendTemplateResult,
} from "./types";

export class ConsoleWhatsAppProvider implements IWhatsAppProvider {
  async sendTemplate(args: SendTemplateArgs): Promise<SendTemplateResult> {
    const messageId = `console.${randomUUID()}`;
    // eslint-disable-next-line no-console
    console.log(
      `\n[whatsapp:console] template=${args.template} to=${args.to}\n` +
        `  body vars: ${JSON.stringify(args.bodyVars ?? [])}\n` +
        `  button vars: ${JSON.stringify(args.buttonVars ?? [])}\n` +
        `  messageId: ${messageId}\n`,
    );
    return { messageId };
  }
}
