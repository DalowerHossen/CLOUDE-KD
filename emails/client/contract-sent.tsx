// path: emails/client/contract-sent.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface ContractSentEmailProps {
  clientName: string;
  companyName: string;
  title: string;
  number: string;
  /** The date the signature is needed by, or "not set". */
  signBy: string;
  message: string;
  link: string;
}

export function ContractSentEmail(p: ContractSentEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`${p.companyName} asks you to sign ${p.title}`}
      clientName={p.clientName}
      message={p.message}
      button={{ label: 'Review and sign', href: p.link }}
    >
      <Text style={bodyStyle}>
        {p.companyName} asks you to review and sign {p.title} ({p.number}).
        {p.signBy === 'not set' ? '' : ` Please sign by ${p.signBy}.`} For your safety we first send
        a six digit code to this e-mail address when you open the link.
      </Text>
    </ClientFrame>
  );
}
