// path: emails/client/thank-you.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface ThankYouEmailProps {
  clientName: string;
  companyName: string;
  invoiceNumber: string;
  amount: string;
}

export function ThankYouEmail(p: ThankYouEmailProps): JSX.Element {
  return (
    <ClientFrame preview={`Thank you from ${p.companyName}`} clientName={p.clientName}>
      <Text style={bodyStyle}>
        Invoice {p.invoiceNumber} ({p.amount} US dollars) is paid in full. Thank you from everyone
        at {p.companyName}; we enjoy working with you.
      </Text>
    </ClientFrame>
  );
}
