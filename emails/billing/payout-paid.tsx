// path: emails/billing/payout-paid.tsx
import { Text } from '@react-email/components';
import { bodyStyle, BillingFrame } from './billing-frame';

export interface PayoutPaidEmailProps {
  companyName: string;
  amount: string;
  reference: string;
  link: string;
}

export function PayoutPaidEmail(p: PayoutPaidEmailProps): JSX.Element {
  return (
    <BillingFrame
      preview={`Your payout of ${p.amount} was sent`}
      button={{ label: 'See your payouts', href: p.link }}
    >
      <Text style={bodyStyle}>
        A payout of {p.amount} (US dollars) for {p.companyName} was sent to your payout method. Bank
        reference: {p.reference}. Your bank decides how long it takes to show.
      </Text>
    </BillingFrame>
  );
}
