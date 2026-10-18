// path: emails/client/new-link.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface NewLinkEmailProps {
  clientName: string;
  companyName: string;
  /** For example "invoice INV-0001". */
  docLabel: string;
  expiresAt: string;
  link: string;
}

export function NewLinkEmail(p: NewLinkEmailProps): JSX.Element {
  return (
    <ClientFrame
      preview={`Your new link from ${p.companyName}`}
      clientName={p.clientName}
      button={{ label: 'Open the document', href: p.link }}
    >
      <Text style={bodyStyle}>
        {p.companyName} sent you a new link for {p.docLabel}, as you asked. It works until{' '}
        {p.expiresAt}. The old link no longer works.
      </Text>
    </ClientFrame>
  );
}
