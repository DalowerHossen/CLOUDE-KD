// path: emails/client/final-notice.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface FinalNoticeEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  amountDue: string;
  dueDate: string;
  daysLate: string;
  /** Text about a late fee, or an empty text when none applies. */
  lateFee: string;
  message: string;
  link: string;
}

export function FinalNoticeEmail(p: FinalNoticeEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`Final notice: invoice ${p.number}`}
      clientName={p.clientName}
      message={p.message}
      button={{ label: 'Pay the invoice now', href: p.link }}
    >
      <Text style={bodyStyle}>
        This is the final notice for invoice {p.number} from {p.companyName}. The amount due is{' '}
        {p.amountDue} (US dollars) and it was due on {p.dueDate}, {p.daysLate} days ago. Please pay
        it now, or write to us if there is a problem.
      </Text>
      {p.lateFee ? <Text style={bodyStyle}>{p.lateFee}</Text> : null}
    </ClientFrame>
  );
}
