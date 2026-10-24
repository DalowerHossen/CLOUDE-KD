// path: emails/client/proforma.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface ProformaEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  total: string;
  dueDate: string;
  message: string;
  link: string;
}

export function ProformaEmail(p: ProformaEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`Proforma invoice ${p.number} from ${p.companyName}`}
      clientName={p.clientName}
      message={p.message}
      button={{ label: 'View the proforma invoice', href: p.link }}
    >
      <Text style={bodyStyle}>
        {p.companyName} sent you proforma invoice {p.number} for {p.total} (US dollars), valid until{' '}
        {p.dueDate}. A proforma invoice is a preview of the final invoice; it is not a request for
        payment.
      </Text>
    </ClientFrame>
  );
}
