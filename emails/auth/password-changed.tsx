// path: emails/auth/password-changed.tsx
import { Text } from '@react-email/components';
import { AuthEmailLayout, paragraph } from './layout';

export interface PasswordChangedEmailProps {
  time: string;
}

export function PasswordChangedEmail({ time }: PasswordChangedEmailProps): JSX.Element {
  return (
    <AuthEmailLayout preview="Your password was changed">
      <Text style={paragraph}>
        The password of your account was changed at {time} (UTC) and all other sessions were signed
        out.
      </Text>
      <Text style={paragraph}>If you did not do this, contact support at once.</Text>
    </AuthEmailLayout>
  );
}
