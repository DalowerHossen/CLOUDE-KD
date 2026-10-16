// path: emails/auth/layout.tsx
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

export function AuthEmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f6f8',
          fontFamily: 'Arial, Helvetica, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{ backgroundColor: '#ffffff', borderRadius: 8, maxWidth: 520, padding: 32 }}
        >
          <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>KD SOLUTION IT</Text>
          <Section>{children}</Section>
          <Text style={{ color: '#5b6573', fontSize: 12, marginTop: 24 }}>
            This message was sent because of activity on your KD SOLUTION IT account. If this was
            not you, change your password and contact support.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const paragraph = { fontSize: 15, lineHeight: '22px', margin: '0 0 12px' } as const;
export const buttonStyle = {
  backgroundColor: '#1d4ed8',
  borderRadius: 6,
  color: '#ffffff',
  display: 'inline-block',
  fontSize: 15,
  padding: '12px 20px',
  textDecoration: 'none',
} as const;
