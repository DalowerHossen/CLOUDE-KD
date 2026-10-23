// path: emails/client/contract-signed.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface ContractSignedEmailProps {
  clientName: string;
  companyName: string;
  title: string;
  number: string;
  link: string;
}

export function ContractSignedEmail(p: ContractSignedEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`${p.title} is signed by everyone`}
      clientName={p.clientName}
      button={{ label: 'Open your signed copy', href: p.link }}
    >
      <Text style={bodyStyle}>
        Everyone has signed {p.title} ({p.number}) with {p.companyName}. Your signed copy, with the
        certificate of signing, is ready to download. We first send a six digit code to this e-mail
        address when you open the link.
      </Text>
    </ClientFrame>
  );
}
