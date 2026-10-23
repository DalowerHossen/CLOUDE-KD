// path: emails/payroll/pay-notice.tsx
import { Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface PayNoticeEmailProps {
  firstName: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  paidOn: string;
}

const body = { fontSize: 15, lineHeight: '22px' } as const;

export function PayNoticeEmail(p: PayNoticeEmailProps): JSX.Element {
  return (
    <BaseLayout preview={`Your pay for ${p.periodEnd} was paid`}>
      <Text style={body}>Hello {p.firstName},</Text>
      <Text style={body}>
        Your pay from {p.companyName} for {p.periodStart} to {p.periodEnd} was sent by bank transfer
        on {p.paidOn}. Your bank decides how long it takes to show. Ask {p.companyName} for your
        payslip.
      </Text>
    </BaseLayout>
  );
}
