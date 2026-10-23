// path: emails/security/token-otp.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface TokenOtpEmailProps {
  code: string;
}

export function TokenOtpEmail({ code }: TokenOtpEmailProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your one-time code</Preview>
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
            Use this code to open your document. It works once and expires in 5 minutes.
          </Text>
          <Text style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6, margin: '16px 0' }}>
            {code}
          </Text>
          <Text style={{ color: '#5b6573', fontSize: 12 }}>
            If you did not ask for this code, ignore this message. Never share it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
