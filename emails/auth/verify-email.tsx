// path: emails/auth/verify-email.tsx
import { Link, Text } from '@react-email/components';
import { AuthEmailLayout, buttonStyle, paragraph } from './layout';

export interface VerifyEmailProps {
  verifyUrl: string;
}

export function VerifyEmail(props: VerifyEmailProps): JSX.Element {
  return (
    <AuthEmailLayout preview="Confirm your e-mail address">
      <Text style={paragraph}>
        Confirm your e-mail address to finish creating your account. The link works for 24 hours.
      </Text>
      <Link href={props.verifyUrl} style={buttonStyle}>
        Confirm e-mail address
      </Link>
    </AuthEmailLayout>
  );
}
