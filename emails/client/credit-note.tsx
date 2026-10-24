// path: emails/client/credit-note.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface CreditNoteEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  amount: string;
  invoiceNumber: string;
  link: string;
}

export function CreditNoteEmail(p: CreditNoteEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`Credit note ${p.number} from ${p.companyName}`}
      clientName={p.clientName}
      button={{ label: 'View the credit note', href: p.link }}
    >
      <Text style={bodyStyle}>
        {p.companyName} issued credit note {p.number} for {p.amount} (US dollars) against invoice{' '}
        {p.invoiceNumber}.
      </Text>
    </ClientFrame>
  );
}
