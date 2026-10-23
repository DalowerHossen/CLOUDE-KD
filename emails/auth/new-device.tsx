// path: emails/auth/new-device.tsx
import { Text } from '@react-email/components';
import { AuthEmailLayout, paragraph } from './layout';

export interface NewDeviceEmailProps {
  device: string;
  network: string;
  time: string;
}

export function NewDeviceEmail(props: NewDeviceEmailProps): JSX.Element {
  return (
    <AuthEmailLayout preview="New sign-in to your account">
      <Text style={paragraph}>Your account was used to sign in from a new device.</Text>
      <Text style={paragraph}>
        Device: {props.device}. Network: {props.network}. Time: {props.time} (UTC).
      </Text>
      <Text style={paragraph}>
        If this was not you, change your password now and sign out all devices from the security
        page.
      </Text>
    </AuthEmailLayout>
  );
}
