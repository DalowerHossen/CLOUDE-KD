// path: emails/invoice/invoice-reminder.tsx
import { Button, Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface InvoiceReminderEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  amountDue: string;
  dueDate: string;
  /** "is due soon", "is due today", "is overdue" or "needs your attention now". */
  stageText: string;
  /** Days past the due date; "0" when not late. */
  daysLate: string;
  /** A note from the sender; may be empty. */
  message: string;
  link: string;
}

export function InvoiceReminderEmail(p: InvoiceReminderEmailProps): JSX.Element {
  return (
    <BaseLayout preview={`Invoice ${p.number} ${p.stageText}`}>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>Hello {p.clientName},</Text>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>
        This is a reminder that invoice {p.number} from {p.companyName} {p.stageText}. The amount
        due is {p.amountDue} (US dollars). The due date{p.daysLate === '0' ? ' is ' : ' was '}
        {p.dueDate}.
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
        If you have already paid, please ignore this message. If the button does not work, copy this
        address into your browser: {p.link}
      </Text>
    </BaseLayout>
  );
}
