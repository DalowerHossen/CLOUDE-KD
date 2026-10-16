// path: emails/onboarding/guidance.tsx
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

export interface GuidanceProps {
  name: string;
}

interface Copy {
  preview: string;
  lines: readonly string[];
}

function Layout({ name, copy }: GuidanceProps & { copy: Copy }): JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>{copy.preview}</Preview>
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
            {name ? `Hello ${name},` : 'Hello,'}
          </Text>
          {copy.lines.map((line, i) => (
            <Text key={i} style={{ fontSize: 15, lineHeight: '22px' }}>
              {line}
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}

const DAY_1: Copy = {
  preview: 'Finish setting up your workspace',
  lines: [
    'Welcome to KD SOLUTION IT. A few minutes of setup makes your first invoice faster: add your company details, your logo and your invoice defaults.',
    'Sign in and open the setup guide. You can stop at any step and continue later.',
  ],
};
const DAY_3: Copy = {
  preview: 'Add your first client',
  lines: [
    'The next step is your first client. Add a name and an e-mail address and you can send an invoice in a minute.',
    'Your clients never need an account: they open a secure link to view and pay.',
  ],
};
const DAY_7: Copy = {
  preview: 'Invite your team and protect your account',
  lines: [
    'If other people help with your billing, invite them and give each person only the permissions they need.',
    'Also turn on two-factor sign-in for your own account and save the recovery codes.',
  ],
};
const DAY_14: Copy = {
  preview: 'Two weeks in: verify your business',
  lines: [
    'Verifying your business unlocks payouts and higher limits. It takes a few documents and a short review.',
    'If you need help at any point, write to us through the contact page of our website.',
  ],
};

export const Day1Email = ({ name }: GuidanceProps): JSX.Element => (
  <Layout name={name} copy={DAY_1} />
);
export const Day3Email = ({ name }: GuidanceProps): JSX.Element => (
  <Layout name={name} copy={DAY_3} />
);
export const Day7Email = ({ name }: GuidanceProps): JSX.Element => (
  <Layout name={name} copy={DAY_7} />
);
export const Day14Email = ({ name }: GuidanceProps): JSX.Element => (
  <Layout name={name} copy={DAY_14} />
);
