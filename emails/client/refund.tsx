// path: emails/client/refund.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface RefundEmailProps {
  clientName: string;
  companyName: string;
  reference: string;
  amount: string;
  invoiceNumber: string;
  refundedAt: string;
}

export function RefundEmail(p: RefundEmailProps): JSX.Element {
  return (
    <ClientFrame preview={`Refund of ${p.amount} from ${p.companyName}`} clientName={p.clientName}>
      <Text style={bodyStyle}>
        {p.companyName} refunded {p.amount} (US dollars) on {p.refundedAt} for invoice{' '}
        {p.invoiceNumber} (payment {p.reference}). The money goes back to the card or account you
        paid with; your bank decides how long it takes to show.
      </Text>
    </ClientFrame>
  );
}
