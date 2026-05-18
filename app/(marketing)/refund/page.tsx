import {
  LegalList,
  LegalP,
  LegalSection,
  LegalShell,
} from "@/components/marketing/LegalShell";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Refund & Cancellation Policy",
  description:
    "How subscription cancellations and refunds work for AstraBill.",
  path: "/refund",
});

const EFFECTIVE = "18 May 2026";

export default function RefundPage() {
  return (
    <LegalShell title="Refund & Cancellation Policy" effectiveDate={EFFECTIVE}>
      <LegalP>
        This policy explains how cancellations and refunds work for paid
        AstraBill subscriptions. AstraBill is operated by Opryon Labs. This is
        an initial version and may be updated as the Service grows.
      </LegalP>

      <LegalSection heading="1. Free plan">
        <LegalP>
          The free plan has no charge and nothing to cancel. You can stop using
          it at any time.
        </LegalP>
      </LegalSection>

      <LegalSection heading="2. Cancelling a paid plan">
        <LegalList
          items={[
            "You can cancel a paid subscription at any time from your account.",
            "On cancellation, your plan stays active until the end of the period you have already paid for; it is not renewed after that.",
            "After the period ends, your account moves to the free plan — your data is retained, subject to plan limits.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Refunds">
        <LegalList
          items={[
            "Subscription fees already paid are generally non-refundable, since access is provided for the full paid period.",
            "If you were charged in error, or there was a genuine billing problem, contact us within 7 days and we will review and, where appropriate, refund.",
            "Approved refunds are returned to the original payment method through our payment partner; the time to reflect depends on your bank or provider.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. WhatsApp message charges">
        <LegalP>
          Charges for WhatsApp messages sent beyond your plan&rsquo;s included
          allowance reflect a service already delivered and are non-refundable.
        </LegalP>
      </LegalSection>

      <LegalSection heading="5. How to request a refund">
        <LegalP>
          Email{" "}
          <a className="text-primary hover:underline" href="mailto:hello@astrabill.com">
            hello@astrabill.com
          </a>{" "}
          from your registered email with your account details and the reason
          for the request. We aim to respond within 3 working days.
        </LegalP>
      </LegalSection>
    </LegalShell>
  );
}
