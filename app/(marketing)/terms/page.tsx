import {
  LegalList,
  LegalP,
  LegalSection,
  LegalShell,
} from "@/components/marketing/LegalShell";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms & Conditions",
  description:
    "The terms governing your use of AstraBill, operated by Opryon Labs.",
  path: "/terms",
});

const EFFECTIVE = "18 May 2026";

export default function TermsPage() {
  return (
    <LegalShell title="Terms & Conditions" effectiveDate={EFFECTIVE}>
      <LegalP>
        These Terms govern your use of AstraBill (the &ldquo;Service&rdquo;),
        operated by Opryon Labs (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By
        creating an account or using the Service, you agree to these Terms.
        This is an initial version and may be updated as the Service grows.
      </LegalP>

      <LegalSection heading="1. The Service">
        <LegalP>
          AstraBill is software that helps Indian businesses create GST
          invoices, deliver them over WhatsApp, collect payments via UPI, track
          receivables, and manage basic inventory. It is a tool you operate —
          it does not provide accounting, tax, or legal advice.
        </LegalP>
      </LegalSection>

      <LegalSection heading="2. Accounts and eligibility">
        <LegalP>
          You must be able to form a binding contract and use the Service for a
          lawful business purpose. You are responsible for activity under your
          account and for keeping your sign-in method secure.
        </LegalP>
      </LegalSection>

      <LegalSection heading="3. Your responsibilities">
        <LegalList
          items={[
            "Provide accurate business, tax, customer, and invoice information.",
            "Ensure your invoices, GST treatment, and tax filings are correct and compliant — that responsibility remains yours.",
            "Use the Service only to send invoices and messages to recipients who expect them; do not use it for spam or unlawful content.",
            "Comply with the WhatsApp Business Platform policies when messages are sent on your behalf.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Plans, billing, and payments">
        <LegalP>
          The Service offers a free plan and paid subscription plans billed
          monthly or annually. Paid plans are processed through our payment
          partner. Fees are stated on our pricing section and may change with
          notice. Cancellation and refunds are governed by our{" "}
          <a className="text-primary hover:underline" href="/refund">
            Refund &amp; Cancellation Policy
          </a>
          .
        </LegalP>
      </LegalSection>

      <LegalSection heading="5. Intellectual property">
        <LegalP>
          The Service, including its software, design, and brand, is owned by
          Opryon Labs. The business and invoice data you enter remains yours;
          you grant us a limited licence to process it solely to operate the
          Service for you.
        </LegalP>
      </LegalSection>

      <LegalSection heading="6. Disclaimers">
        <LegalP>
          The Service is provided &ldquo;as is&rdquo;. We do not warrant that
          it will be uninterrupted or error-free, and we are not your
          accountant or tax adviser. You are responsible for verifying invoice
          amounts, tax calculations, and statutory compliance.
        </LegalP>
      </LegalSection>

      <LegalSection heading="7. Limitation of liability">
        <LegalP>
          To the maximum extent permitted by law, Opryon Labs is not liable for
          indirect or consequential losses. Our total liability for any claim
          relating to the Service is limited to the amount you paid us for the
          Service in the three months before the claim.
        </LegalP>
      </LegalSection>

      <LegalSection heading="8. Termination">
        <LegalP>
          You may stop using the Service and close your account at any time. We
          may suspend or terminate access if these Terms are breached. Finalised
          invoices remain available as required for your records and by law.
        </LegalP>
      </LegalSection>

      <LegalSection heading="9. Governing law">
        <LegalP>
          These Terms are governed by the laws of India, and disputes are
          subject to the jurisdiction of the courts in India.
        </LegalP>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <LegalP>
          Questions about these Terms? Email{" "}
          <a className="text-primary hover:underline" href="mailto:hello@astrabill.com">
            hello@astrabill.com
          </a>
          .
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}
