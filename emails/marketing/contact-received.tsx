// path: emails/marketing/contact-received.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface ContactReceivedProps {
  name: string;
  email: string;
  topic: string;
  message: string;
}

export function ContactReceivedEmail({
  name,
  email,
  topic,
  message,
}: ContactReceivedProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`New contact message (${topic})`}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f6f8',
          fontFamily: 'Arial, Helvetica, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{ backgroundColor: '#ffffff', borderRadius: 8, maxWidth: 560, padding: 32 }}
        >
          <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>
            New contact message
          </Text>
          <Text style={{ fontSize: 14, margin: '0 0 4px' }}>
            From: {name} ({email})
          </Text>
          <Text style={{ fontSize: 14, margin: '0 0 12px' }}>Topic: {topic}</Text>
          <Text style={{ fontSize: 15, lineHeight: '22px', whiteSpace: 'pre-wrap' }}>
            {message}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
