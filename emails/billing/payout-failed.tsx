// path: emails/billing/payout-failed.tsx
import { Text } from '@react-email/components';
import { bodyStyle, BillingFrame } from './billing-frame';

export interface PayoutFailedEmailProps {
  companyName: string;
  amount: string;
  reason: string;
  link: string;
}

export function PayoutFailedEmail(p: PayoutFailedEmailProps): JSX.Element {
  return (
    <BillingFrame
      preview={`A payout of ${p.amount} failed`}
      button={{ label: 'See your wallet', href: p.link }}
    >
      <Text style={bodyStyle}>
        A payout of {p.amount} (US dollars) for {p.companyName} did not go through: {p.reason}. The
        money is back in your available balance. Check your payout method and ask again.
      </Text>
    </BillingFrame>
  );
}
