// path: app/(client-portal)/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PortalShell } from '@/components/layout/portal-shell';

// Token pages must never be indexed and must not leak the link through the referrer header.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function PortalLayout({ children }: { children: ReactNode }): JSX.Element {
  return <PortalShell>{children}</PortalShell>;
}
