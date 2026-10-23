// path: emails/onboarding/invitation.tsx
import { Body, Button, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface InvitationProps {
  inviterName: string;
  companyName: string;
  acceptUrl: string;
  expiresOn: string;
}

export function InvitationEmail({
  inviterName,
  companyName,
  acceptUrl,
  expiresOn,
}: InvitationProps): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`You are invited to join ${companyName}`}</Preview>
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
          <Text style={{ fontSize: 15, lineHeight: '22px' }}>
            {`${inviterName} invited you to join ${companyName} on KD SOLUTION IT.`}
          </Text>
          <Button
            href={acceptUrl}
            style={{
              backgroundColor: '#1d4ed8',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: 15,
              padding: '12px 20px',
              textDecoration: 'none',
            }}
          >
            Accept the invitation
          </Button>
          <Text style={{ fontSize: 13, lineHeight: '20px', color: '#5b6573' }}>
            {`The link works once and ends on ${expiresOn}. If you do not know this person, ignore this e-mail and nothing happens.`}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
