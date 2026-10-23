// path: emails/invoice/estimate-sent.tsx
import { Button, Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface EstimateSentEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  total: string;
  validUntil: string;
  /** A personal note from the sender; may be empty. */
  message: string;
  link: string;
}

export function EstimateSentEmail(p: EstimateSentEmailProps): JSX.Element {
  return (
    <BaseLayout preview={`Estimate ${p.number} from ${p.companyName}`}>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>Hello {p.clientName},</Text>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>
        {p.companyName} sent you estimate {p.number} for {p.total} (US dollars). It is valid until{' '}
        {p.validUntil}. You can look at it, accept it or decline it online.
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
        View the estimate
      </Button>
      <Text style={{ fontSize: 13, color: '#555555' }}>
        If the button does not work, copy this address into your browser: {p.link}
      </Text>
    </BaseLayout>
  );
}
