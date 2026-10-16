// path: emails/crm/statement.tsx
import { Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface StatementEmailProps {
  clientName: string;
  companyName: string;
  from: string;
  to: string;
  openingBalance: string;
  balance: string;
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d91_plus: string;
  /** One line per open document, for example "INV-0007, due 2026-04-10: 100.10". */
  lines: string;
}

const row = { fontSize: 14, lineHeight: '20px', margin: '0 0 4px' } as const;

export function StatementEmail(p: StatementEmailProps): JSX.Element {
  return (
    <BaseLayout preview={`Statement from ${p.companyName}`}>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>Hello {p.clientName},</Text>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>
        Here is your statement from {p.companyName} for {p.from} to {p.to}. All amounts are in US
        dollars.
      </Text>
      <Text style={row}>Opening balance: {p.openingBalance}</Text>
      <Text style={row}>Not yet due: {p.current}</Text>
      <Text style={row}>1 to 30 days late: {p.d1_30}</Text>
      <Text style={row}>31 to 60 days late: {p.d31_60}</Text>
      <Text style={row}>61 to 90 days late: {p.d61_90}</Text>
      <Text style={row}>Over 90 days late: {p.d91_plus}</Text>
      <Text style={{ fontSize: 15, fontWeight: 700, margin: '12px 0' }}>Balance: {p.balance}</Text>
      {p.lines ? (
        <Text style={{ fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-line' }}>{p.lines}</Text>
      ) : null}
      <Text style={{ fontSize: 13, color: '#555555' }}>
        If something looks wrong, reply to {p.companyName}.
      </Text>
    </BaseLayout>
  );
}
