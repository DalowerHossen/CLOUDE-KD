// path: emails/security/alert.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface AlertEmailProps {
  severity: string;
  title: string;
  body: string;
}

export function AlertEmail({ severity, title, body }: AlertEmailProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`[${severity}] ${title}`}</Preview>
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
          <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>KD SOLUTION IT</Text>
          <Text style={{ color: '#b42318', fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
            {severity.toUpperCase()} security alert
          </Text>
          <Text style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{title}</Text>
          <Text style={{ fontSize: 14, lineHeight: '21px', whiteSpace: 'pre-wrap' }}>{body}</Text>
          <Text style={{ color: '#5b6573', fontSize: 12, marginTop: 16 }}>
            Open the admin console, Alerts page, to acknowledge this alert. Unacknowledged alerts
            are escalated.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
