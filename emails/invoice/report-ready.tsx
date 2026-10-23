// path: emails/invoice/report-ready.tsx
import { Button, Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface ReportReadyEmailProps {
  companyName: string;
  reportTitle: string;
  period: string;
  format: string;
  link: string;
}

export function ReportReadyEmail(p: ReportReadyEmailProps): JSX.Element {
  return (
    <BaseLayout preview={`${p.reportTitle} for ${p.companyName}`}>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>
        Your scheduled report &quot;{p.reportTitle}&quot; for {p.companyName} is ready ({p.period},{' '}
        {p.format}
        ).
      </Text>
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
        Download the report
      </Button>
      <Text style={{ fontSize: 13, color: '#555555' }}>
        The link works for seven days. If the button does not work, copy this address into your
        browser: {p.link}
      </Text>
    </BaseLayout>
  );
}
