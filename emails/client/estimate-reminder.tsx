// path: emails/client/estimate-reminder.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface EstimateReminderEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  total: string;
  validUntil: string;
  message: string;
  link: string;
}

export function EstimateReminderEmail(p: EstimateReminderEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`Estimate ${p.number} is waiting for your answer`}
      clientName={p.clientName}
      message={p.message}
      button={{ label: 'Review the estimate', href: p.link }}
    >
      <Text style={bodyStyle}>
        Estimate {p.number} from {p.companyName} for {p.total} (US dollars) is still waiting for
        your answer. It is valid until {p.validUntil}.
      </Text>
    </ClientFrame>
  );
}
