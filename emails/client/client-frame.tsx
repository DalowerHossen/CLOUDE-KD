// path: emails/client/client-frame.tsx
// The shared body of every client message: greeting, text, one button and the forward warning. The button address is
// also printed as text, because some mail programs hide buttons.
import { Button, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import { BaseLayout } from '../layout/base-layout';

const body = { fontSize: 15, lineHeight: '22px' } as const;

export function ForwardNotice(): JSX.Element {
  return (
    <Text style={{ fontSize: 12, color: '#555555', lineHeight: '18px' }}>
      This message holds a private link made for you. Please do not forward it: anyone who has the
      link can open the document.
    </Text>
  );
}

export interface ClientFrameProps {
  preview: string;
  clientName: string;
  /** Paragraphs shown after the greeting. */
  children: ReactNode;
  /** A note from the sender; may be empty. */
  message?: string;
  button?: { label: string; href: string };
  /** False for messages without a private link (a thank-you, a refund note). */
  privateLink?: boolean;
}

export function ClientFrame(p: ClientFrameProps): JSX.Element {
  const privateLink = p.privateLink ?? p.button !== undefined;
  return (
    <BaseLayout preview={p.preview}>
      <Text style={body}>Hello {p.clientName},</Text>
      {p.children}
      {p.message ? (
        <Text style={{ ...body, fontSize: 14, whiteSpace: 'pre-line' }}>{p.message}</Text>
      ) : null}
      {p.button ? (
        <>
          <Button
            href={p.button.href}
            style={{
              backgroundColor: '#111827',
              color: '#ffffff',
              padding: '12px 20px',
              borderRadius: 6,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            {p.button.label}
          </Button>
          <Text style={{ fontSize: 13, color: '#555555' }}>
            If the button does not work, copy this address into your browser: {p.button.href}
          </Text>
        </>
      ) : null}
      {privateLink ? <ForwardNotice /> : null}
    </BaseLayout>
  );
}

export { body as bodyStyle };
