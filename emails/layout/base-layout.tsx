// path: emails/layout/base-layout.tsx
// Shared layout for new templates: brand name and color on top, content in a white card, optional footer.
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';
import type { ReactNode } from 'react';

export interface BaseLayoutProps {
  preview: string;
  productName?: string;
  primaryColor?: string;
  footerText?: string;
  children: ReactNode;
}

export function BaseLayout({
  preview,
  productName = 'KD SOLUTION IT',
  primaryColor = '#1d4ed8',
  footerText,
  children,
}: BaseLayoutProps): JSX.Element {
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
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 8,
            borderTop: `4px solid ${primaryColor}`,
            maxWidth: 600,
            padding: 32,
          }}
        >
          <Text style={{ color: primaryColor, fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
            {productName}
          </Text>
          {children}
          {footerText ? (
            <Text style={{ color: '#5b6573', fontSize: 12, margin: '16px 0 0' }}>{footerText}</Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
