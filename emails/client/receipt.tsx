// path: emails/client/receipt.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface ReceiptEmailProps {
  clientName: string;
  companyName: string;
  reference: string;
  amount: string;
  paidAt: string;
  invoiceNumber: string;
  link: string;
}

export function ReceiptEmail(p: ReceiptEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`Receipt ${p.reference} from ${p.companyName}`}
      clientName={p.clientName}
      button={{ label: 'View your receipt', href: p.link }}
    >
      <Text style={bodyStyle}>
        Thank you. {p.companyName} received your payment of {p.amount} (US dollars) on {p.paidAt}
        for invoice {p.invoiceNumber}. Your receipt reference is {p.reference}.
      </Text>
    </ClientFrame>
  );
}
