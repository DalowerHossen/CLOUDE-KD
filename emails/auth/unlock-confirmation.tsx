// path: emails/auth/unlock-confirmation.tsx
import { Link, Text } from '@react-email/components';
import { AuthEmailLayout, buttonStyle, paragraph } from './layout';

export interface UnlockConfirmationEmailProps {
  confirmUrl: string;
}

export function UnlockConfirmationEmail(props: UnlockConfirmationEmailProps): JSX.Element {
  return (
    <AuthEmailLayout preview="Confirm that your account may be unlocked">
      <Text style={paragraph}>
        A platform administrator asked to end the lock on your account early. Confirm only if you
        contacted support yourself.
      </Text>
      <Link href={props.confirmUrl} style={buttonStyle}>
        Confirm unlock
      </Link>
      <Text style={paragraph}>
        The link works once and expires in 24 hours. If you did not ask for this, ignore the
        message; the account stays locked.
      </Text>
    </AuthEmailLayout>
  );
}
