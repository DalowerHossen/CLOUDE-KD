// path: emails/marketing/welcome.tsx
import { MessageEmail } from './message';

export interface StepProps {
  name: string;
}

const greeting = (name: string): string => (name ? `Hello ${name},` : 'Hello,');

export function WelcomeEmail({ name }: StepProps): JSX.Element {
  return (
    <MessageEmail
      preview="Welcome to KD SOLUTION IT"
      greeting={greeting(name)}
      paragraphs={[
        'Thank you for your interest in KD SOLUTION IT. You asked to hear from us, so we will send a few short e-mails about getting more out of invoicing, payments, payroll and accounting.',
        'You can stop these e-mails at any time with the unsubscribe link of your mail program or of this message.',
      ]}
    />
  );
}

export function DripTwoEmail({ name }: StepProps): JSX.Element {
  return (
    <MessageEmail
      preview="Get paid faster"
      greeting={greeting(name)}
      paragraphs={[
        'Late payments cost small businesses time and cash. Three habits help: send invoices the day the work is done, state the due date clearly, and send a friendly reminder before the due date.',
        'KD SOLUTION IT can send those reminders for you, and your clients can pay from a secure link without creating an account.',
      ]}
    />
  );
}

export function DripThreeEmail({ name }: StepProps): JSX.Element {
  return (
    <MessageEmail
      preview="Ready to try it?"
      greeting={greeting(name)}
      paragraphs={[
        'If you would like to see how the platform fits your business, you can create an account or write to us with your questions through the contact page on our website.',
        'Thank you for reading. This is the last e-mail of this short series.',
      ]}
    />
  );
}
