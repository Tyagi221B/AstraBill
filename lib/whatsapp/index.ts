/**
 * Single switch point for the WhatsApp provider. Services import `whatsapp`
 * from here and never know which implementation is running.
 *
 * Lazy singleton — instantiation is deferred to the first call so that
 * `next build` (which sets NODE_ENV=production while collecting page data)
 * does not trigger the "creds required in prod" guard before any real
 * request has been made.
 */
import "server-only";
import { ConsoleWhatsAppProvider } from "./console";
import { MetaWhatsAppProvider } from "./meta";
import type { IWhatsAppProvider } from "./types";

let instance: IWhatsAppProvider | undefined;

function getInstance(): IWhatsAppProvider {
  if (instance) return instance;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (phoneNumberId && accessToken) {
    instance = new MetaWhatsAppProvider(phoneNumberId, accessToken);
    return instance;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WhatsApp is not configured in production. Set " +
        "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
    );
  }
  // Dev / test — OTPs print to the server console.
  instance = new ConsoleWhatsAppProvider();
  return instance;
}

export const whatsapp: IWhatsAppProvider = new Proxy({} as IWhatsAppProvider, {
  get(_target, prop) {
    const i = getInstance();
    const value = Reflect.get(i, prop, i);
    return typeof value === "function" ? value.bind(i) : value;
  },
});

export type { IWhatsAppProvider, SendTemplateArgs } from "./types";
