// path: components/client/state-card.tsx
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface StateCardProps {
  title: string;
  body: string;
  children?: ReactNode;
}

/** The plain card every portal state (invalid, revoked, limited, expired) is shown in. */
export function StateCard({ title, body, children }: StateCardProps): JSX.Element {
  return (
    <Card role="status">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}
