// path: emails/auth/reset-password.tsx
import { Link, Text } from '@react-email/components';
import { AuthEmailLayout, buttonStyle, paragraph } from './layout';

export interface ResetPasswordEmailProps {
  resetUrl: string;
}

export function ResetPasswordEmail(props: ResetPasswordEmailProps): JSX.Element {
  return (
    <AuthEmailLayout preview="Reset your password">
      <Text style={paragraph}>
        We received a request to reset your password. The link works once and expires in 1 hour.
      </Text>
      <Link href={props.resetUrl} style={buttonStyle}>
        Choose a new password
      </Link>
      <Text style={paragraph}>If you did not ask for this, ignore this message.</Text>
    </AuthEmailLayout>
  );
}
