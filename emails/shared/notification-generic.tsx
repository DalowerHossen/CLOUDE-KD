// path: emails/shared/notification-generic.tsx
import { Body, Button, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface NotificationGenericProps {
  title: string;
  body: string;
  link: string;
}

export function NotificationGenericEmail({
  title,
  body,
  link,
}: NotificationGenericProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>{title}</Preview>
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
          <Text style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{title}</Text>
          <Text style={{ fontSize: 15, lineHeight: '22px', margin: '0 0 16px' }}>{body}</Text>
          {link ? (
            <Button
              href={link}
              style={{
                backgroundColor: '#1d4ed8',
                borderRadius: 6,
                color: '#ffffff',
                fontSize: 14,
                padding: '10px 18px',
              }}
            >
              Open
            </Button>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
