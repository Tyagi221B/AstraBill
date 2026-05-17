/**
 * Single switch point for the WhatsApp provider. Services import `whatsapp`
 * from here and never know which implementation is running. To swap, change
 * this file — and only this file.
 */
import "server-only";
import { ConsoleWhatsAppProvider } from "./console";
import { MetaWhatsAppProvider } from "./meta";
import type { IWhatsAppProvider } from "./types";

function pickProvider(): IWhatsAppProvider {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (phoneNumberId && accessToken) {
    return new MetaWhatsAppProvider(phoneNumberId, accessToken);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WhatsApp is not configured in production. Set WHATSAPP_PHONE_NUMBER_ID " +
        "and WHATSAPP_ACCESS_TOKEN.",
    );
  }
  // Dev / test — no creds, OTPs print to the server console.
  return new ConsoleWhatsAppProvider();
}

export const whatsapp: IWhatsAppProvider = pickProvider();
export type { IWhatsAppProvider, SendTemplateArgs } from "./types";
