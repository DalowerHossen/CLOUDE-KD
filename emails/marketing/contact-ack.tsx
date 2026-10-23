// path: emails/marketing/contact-ack.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface ContactAckProps {
  name: string;
}

export function ContactAckEmail({ name }: ContactAckProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>We received your message</Preview>
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
          <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>KD SOLUTION IT</Text>
          <Text style={{ fontSize: 15, lineHeight: '22px' }}>Hello {name},</Text>
          <Text style={{ fontSize: 15, lineHeight: '22px' }}>
            Thank you for writing to us. We received your message and will answer by e-mail, usually
            within one working day.
          </Text>
          <Text style={{ color: '#5b6573', fontSize: 12 }}>
            If you did not send this message, you can ignore this e-mail.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
