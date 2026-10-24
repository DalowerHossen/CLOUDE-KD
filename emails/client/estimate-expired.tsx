// path: emails/client/estimate-expired.tsx
import { Text } from '@react-email/components';
import { bodyStyle, ClientFrame } from './client-frame';

export interface EstimateExpiredEmailProps {
  clientName: string;
  companyName: string;
  number: string;
  validUntil: string;
  contactEmail: string;
}

export function EstimateExpiredEmail(p: EstimateExpiredEmailProps): JSX.Element {
  return (
    <ClientFrame preview={`Estimate ${p.number} has expired`} clientName={p.clientName}>
      <Text style={bodyStyle}>
        Estimate {p.number} from {p.companyName} expired on {p.validUntil} and can no longer be
        accepted. If you still want it, write to {p.contactEmail} and ask for a new estimate.
      </Text>
    </ClientFrame>
  );
}
