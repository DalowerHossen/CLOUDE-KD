// path: emails/auth/account-locked.tsx
import { Text } from '@react-email/components';
import { AuthEmailLayout, paragraph } from './layout';

export interface AccountLockedEmailProps {
  audience: 'account' | 'company_owner';
  lockedUntil: string | null;
}

export function AccountLockedEmail(props: AccountLockedEmailProps): JSX.Element {
  return (
    <AuthEmailLayout preview="Sign-in was locked for 2 hours">
      <Text style={paragraph}>
        {props.audience === 'company_owner'
          ? 'Sign-in for a member of your team was locked after repeated failed attempts.'
          : 'Sign-in to your account was locked after repeated failed attempts.'}
      </Text>
      <Text style={paragraph}>
        The lock ends at {props.lockedUntil ?? 'the end of the two hour period'} (UTC). During the
        lock a correct password does not work and password reset is switched off.
      </Text>
      <Text style={paragraph}>
        If this was not you, do nothing. Only a platform administrator can end the lock early, and
        only after you confirm it by e-mail.
      </Text>
    </AuthEmailLayout>
  );
}
