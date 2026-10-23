// path: emails/billing/billing-frame.tsx
// The shared body of the billing messages sent to company owners: greeting, text and one optional button.
import { Button, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import { BaseLayout } from '../layout/base-layout';

export const bodyStyle = { fontSize: 15, lineHeight: '22px' } as const;

export interface BillingFrameProps {
  preview: string;
  children: ReactNode;
  button?: { label: string; href: string };
}

export function BillingFrame(p: BillingFrameProps): JSX.Element {
  return (
    <BaseLayout preview={p.preview}>
      <Text style={bodyStyle}>Hello,</Text>
      {p.children}
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
    </BaseLayout>
  );
}
