// path: emails/payroll/portal-link.tsx
import { Button, Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface PortalLinkEmailProps {
  firstName: string;
  companyName: string;
  link: string;
  expiresAt: string;
}

const body = { fontSize: 15, lineHeight: '22px' } as const;

export function PortalLinkEmail(p: PortalLinkEmailProps): JSX.Element {
  return (
    <BaseLayout preview="Open your payslips">
      <Text style={body}>Hello {p.firstName},</Text>
      <Text style={body}>
        {p.companyName} sent you a private link to your payslips. It works until {p.expiresAt} and
        asks for a code we send to this address. Do not forward it.
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
        Open my payslips
      </Button>
      <Text style={{ fontSize: 13, color: '#555555' }}>
        If the button does not work, copy this address into your browser: {p.link}
      </Text>
    </BaseLayout>
  );
}
