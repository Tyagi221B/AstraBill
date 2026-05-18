import {
  LegalList,
  LegalP,
  LegalSection,
  LegalShell,
} from "@/components/marketing/LegalShell";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "How AstraBill, operated by Opryon Labs, collects, uses, and protects your data.",
  path: "/privacy",
});

const EFFECTIVE = "18 May 2026";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" effectiveDate={EFFECTIVE}>
      <LegalP>
        This Privacy Policy explains how Opryon Labs (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) handles information in connection with AstraBill, our
        GST billing software for Indian businesses (the &ldquo;Service&rdquo;).
        By using the Service you agree to this policy. This is an initial
        version and may be updated as the Service grows.
      </LegalP>

      <LegalSection heading="1. Information we collect">
        <LegalList
          items={[
            "Account information — your name, phone number, and email address, collected when you sign in via WhatsApp OTP or Google.",
            "Business information — business name, GSTIN, address, and bank/UPI details you add to your business profile.",
            "Operational data — the customers, products, invoices, and payment records you create in the Service.",
            "Usage data — basic product-analytics events (for example, sign-in and invoice activity) and error diagnostics, used to improve the Service.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. How we use your information">
        <LegalList
          items={[
            "To provide the Service — creating and delivering invoices, tracking payments, and managing your account.",
            "To send invoices and receipts on your behalf over WhatsApp and email to the recipients you choose.",
            "To operate, secure, and improve the Service, and to diagnose problems.",
            "To communicate with you about your account, billing, and material changes to the Service.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Sharing with service providers">
        <LegalP>
          We do not sell your data. We share it only with providers that help
          us run the Service, each handling data on our instructions:
        </LegalP>
        <LegalList
          items={[
            "Hosting and database — our cloud infrastructure and PostgreSQL provider.",
            "Payments — Razorpay, to generate payment links and process payments.",
            "Messaging — the WhatsApp Business Platform (Meta), to deliver invoices and receipts.",
            "Email — our transactional email provider.",
            "Media storage and analytics — our file-storage CDN and our product-analytics provider.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Data security">
        <LegalP>
          We use industry-standard measures to protect your data, including
          encryption in transit, scoped access controls, and audit logging of
          changes. No system is perfectly secure, but we work to keep your
          information safe.
        </LegalP>
      </LegalSection>

      <LegalSection heading="5. Data retention">
        <LegalP>
          We retain your business and invoice records for as long as your
          account is active and as required for tax and legal compliance.
          Finalised invoices are kept as part of your books. You may request
          deletion of your account, subject to records we must retain by law.
        </LegalP>
      </LegalSection>

      <LegalSection heading="6. Your rights">
        <LegalP>
          You may access, correct, or request deletion of your personal
          information by contacting us. We will respond within a reasonable
          time.
        </LegalP>
      </LegalSection>

      <LegalSection heading="7. Changes to this policy">
        <LegalP>
          We may update this policy from time to time. Material changes will be
          reflected by updating the effective date above and, where
          appropriate, by notifying you.
        </LegalP>
      </LegalSection>

      <LegalSection heading="8. Contact">
        <LegalP>
          Questions about this policy? Email us at{" "}
          <a className="text-primary hover:underline" href="mailto:hello@astrabill.com">
            hello@astrabill.com
          </a>
          .
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}
