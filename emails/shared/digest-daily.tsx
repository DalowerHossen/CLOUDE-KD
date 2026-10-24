// path: emails/shared/digest-daily.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface DigestDailyProps {
  summary: string;
}

export function DigestDailyEmail({ summary }: DigestDailyProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your daily summary</Preview>
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
          <Text style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
            Your daily summary
          </Text>
          <Text style={{ fontSize: 15, lineHeight: '22px', whiteSpace: 'pre-wrap' }}>
            {summary}
          </Text>
          <Text style={{ color: '#5b6573', fontSize: 12, marginTop: 16 }}>
            You get this summary because you switched it on in your notification settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
