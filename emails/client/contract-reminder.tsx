// path: emails/client/contract-reminder.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';
import type { ContractSentEmailProps } from './contract-sent';

export function ContractReminderEmail(p: ContractSentEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`Reminder: please sign ${p.title}`}
      clientName={p.clientName}
      message={p.message}
      button={{ label: 'Review and sign', href: p.link }}
    >
      <Text style={bodyStyle}>
        This is a reminder that {p.title} ({p.number}) from {p.companyName} is still waiting for
        your signature.
        {p.signBy === 'not set' ? '' : ` Please sign by ${p.signBy}.`} This message holds a new
        link; the earlier link no longer works.
      </Text>
    </ClientFrame>
  );
}
