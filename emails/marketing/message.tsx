// path: emails/marketing/message.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface MessageProps {
  preview: string;
  greeting: string;
  paragraphs: readonly string[];
}

/** Shared layout of the plain marketing messages: a greeting and paragraphs of plain text (escaped by React). */
export function MessageEmail({ preview, greeting, paragraphs }: MessageProps): JSX.Element {
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
          <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>KD SOLUTION IT</Text>
          <Text style={{ fontSize: 15, lineHeight: '22px' }}>{greeting}</Text>
          {paragraphs.map((p, i) => (
            <Text key={i} style={{ fontSize: 15, lineHeight: '22px' }}>
              {p}
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}
