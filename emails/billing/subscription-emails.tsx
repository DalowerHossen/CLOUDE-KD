// path: emails/billing/subscription-emails.tsx
// The messages of platform subscription billing: invoice, receipt, renewal reminder, payment problem, move to the free
// plan, trial ending. Amounts are in US dollars.
import { Text } from '@react-email/components';
import { bodyStyle, BillingFrame } from './billing-frame';

export interface InvoiceEmailProps {
  companyName: string;
  number: string;
  total: string;
  dueDate: string;
  description: string;
  link: string;
}

export function SubscriptionInvoiceEmail(p: InvoiceEmailProps): JSX.Element {
  return (
    <BillingFrame
      preview={`Invoice ${p.number} for ${p.companyName}`}
      button={{ label: 'See the invoice', href: p.link }}
    >
      <Text style={bodyStyle}>
        Invoice {p.number} for {p.companyName} is ready: {p.description}. The amount is {p.total}{' '}
        (US dollars) and it is due on {p.dueDate}. You can see how to pay on the invoice page.
      </Text>
    </BillingFrame>
  );
}

export interface ReceiptEmailProps {
  companyName: string;
  number: string;
  total: string;
  paidAt: string;
  link: string;
}

export function SubscriptionReceiptEmail(p: ReceiptEmailProps): JSX.Element {
  return (
    <BillingFrame
      preview={`Payment received for ${p.number}`}
      button={{ label: 'See the receipt', href: p.link }}
    >
      <Text style={bodyStyle}>
        Thank you. We received {p.total} (US dollars) for invoice {p.number} ({p.companyName}) on{' '}
        {p.paidAt}. Your receipt is on the invoice page.
      </Text>
    </BillingFrame>
  );
}

export interface RenewalReminderProps {
  companyName: string;
  planName: string;
  renewsOn: string;
  total: string;
  daysLeft: string;
  link: string;
}

export function RenewalReminderEmail(p: RenewalReminderProps): JSX.Element {
  return (
    <BillingFrame
      preview={`${p.planName} renews in ${p.daysLeft} days`}
      button={{ label: 'Pay the invoice', href: p.link }}
    >
      <Text style={bodyStyle}>
        The {p.planName} plan of {p.companyName} renews on {p.renewsOn} ({p.daysLeft} days left).
        The renewal invoice is {p.total} (US dollars). Pay before the renewal date to keep your plan
        without a break.
      </Text>
    </BillingFrame>
  );
}

export interface PaymentFailedProps {
  companyName: string;
  number: string;
  total: string;
  attempt: string;
  graceEnds: string;
  link: string;
}

export function PaymentFailedEmail(p: PaymentFailedProps): JSX.Element {
  return (
    <BillingFrame
      preview={`Payment needed for invoice ${p.number}`}
      button={{ label: 'Pay now', href: p.link }}
    >
      <Text style={bodyStyle}>
        Invoice {p.number} for {p.companyName} ({p.total}, US dollars) is not paid yet. This is
        notice {p.attempt} of 3.
        {p.graceEnds
          ? ` After the last notice your plan stays active until ${p.graceEnds}; after that the company moves to the free plan. Your data is never deleted.`
          : ''}
      </Text>
    </BillingFrame>
  );
}

export interface DowngradedProps {
  companyName: string;
  planName: string;
  reason: string;
  link: string;
}

export function DowngradedEmail(p: DowngradedProps): JSX.Element {
  return (
    <BillingFrame
      preview={`${p.companyName} moved to the free plan`}
      button={{ label: 'Choose a plan', href: p.link }}
    >
      <Text style={bodyStyle}>
        {p.companyName} moved from the {p.planName} plan to the free plan: {p.reason}. All your data
        is kept. Features and limits of the free plan apply now, and you can subscribe again at any
        time.
      </Text>
    </BillingFrame>
  );
}

export interface TrialEndingProps {
  companyName: string;
  planName: string;
  endsOn: string;
  link: string;
}

export function TrialEndingEmail(p: TrialEndingProps): JSX.Element {
  return (
    <BillingFrame
      preview={`Your ${p.planName} trial ends on ${p.endsOn}`}
      button={{ label: 'Pay the first invoice', href: p.link }}
    >
      <Text style={bodyStyle}>
        The {p.planName} trial of {p.companyName} ends on {p.endsOn}. Pay the first invoice to keep
        the plan. If you do not, the company moves to the free plan and keeps all its data.
      </Text>
    </BillingFrame>
  );
}
