// path: emails/integrations/broadcast.tsx
import { Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface BroadcastEmailProps {
  subject: string;
  body: string;
}

const body = { fontSize: 15, lineHeight: '22px', whiteSpace: 'pre-line' } as const;

/** A plain message from a company to its client (multi-channel messaging). The text is data, never markup. */
export function BroadcastEmail(p: BroadcastEmailProps): JSX.Element {
  return (
    <BaseLayout preview={p.subject}>
      <Text style={body}>{p.body}</Text>
    </BaseLayout>
  );
}
