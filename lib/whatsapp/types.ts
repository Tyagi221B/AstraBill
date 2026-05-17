/**
 * IWhatsAppProvider — external service behind an interface so a route or
 * service never imports the Meta SDK directly. Swap implementations from
 * one line in ./index.ts (test → console mock, prod → Meta).
 */

export type TemplateTextParam = { type: "text"; text: string };

export type TemplateButtonComponent = {
  /** Position of the button on the template (0-indexed). */
  index: number;
  parameters: TemplateTextParam[];
};

export interface SendTemplateArgs {
  /** E.164 phone, with leading "+" (e.g. "+919876543210"). */
  to: string;
  /** Approved Meta template name (e.g. "astrabill_otp_v1"). */
  template: string;
  /** ISO language code; defaults to "en". */
  language?: string;
  /** Variables for the `body` component of the template, in order. */
  bodyVars?: TemplateTextParam[];
  /** Variables for url/quick-reply buttons (e.g. copy-OTP button). */
  buttonVars?: TemplateButtonComponent[];
}

export interface SendTemplateResult {
  /** Meta message id (wamid). Stored in `whatsapp_messages.message_id`. */
  messageId: string;
}

export interface IWhatsAppProvider {
  sendTemplate(args: SendTemplateArgs): Promise<SendTemplateResult>;
}
