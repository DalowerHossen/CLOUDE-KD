// path: emails/shared/test-message.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface TestMessageProps {
  sentBy: string;
}

export function TestMessageEmail({ sentBy }: TestMessageProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>Test message</Preview>
      <Body
        style={{
          backgroundColor: '#f4f6f8',
          fontFamily: 'Arial, Helvetica, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{ backgroundColor: '#ffffff', borderRadius: 8, maxWidth: 480, padding: 32 }}
        >
          <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>KD SOLUTION IT</Text>
          <Text style={{ fontSize: 15, lineHeight: '22px' }}>
            This is a test message. If you can read it, the e-mail settings work.
          </Text>
          <Text style={{ color: '#5b6573', fontSize: 12 }}>
            Sent from the settings of {sentBy}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
