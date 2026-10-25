// path: emails/invoice/invoice-sent.tsx
import { Button, Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface InvoiceSentEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  amountDue: string;
  dueDate: string;
  /** A personal note from the sender; may be empty. */
  message: string;
  link: string;
}

export function InvoiceSentEmail(p: InvoiceSentEmailProps): JSX.Element {
  return (
    <BaseLayout preview={`Invoice ${p.number} from ${p.companyName}`}>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>Hello {p.clientName},</Text>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>
        {p.companyName} sent you invoice {p.number}. The amount due is {p.amountDue} (US dollars),
        payable by {p.dueDate}.
      </Text>
      {p.message ? (
        <Text style={{ fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-line' }}>
          {p.message}
        </Text>
      ) : null}
      <Button
        href={p.link}
        style={{
          backgroundColor: '#111827',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: 6,
          fontSize: 15,
          textDecoration: 'none',
        }}
      >
        View and pay the invoice
      </Button>
      <Text style={{ fontSize: 13, color: '#555555' }}>
        You do not need an account. On the invoice page you can pay by card, download the invoice,
        or cancel it if it is not right.
      </Text>
      <Text style={{ fontSize: 13, color: '#555555' }}>
        If the button does not work, copy this address into your browser: {p.link}
      </Text>
    </BaseLayout>
  );
}
