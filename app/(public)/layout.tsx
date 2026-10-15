// path: app/(public)/layout.tsx
import type { ReactNode } from 'react';
import { visibleNavItems } from '@/components/layout/nav-utils';
import { PublicShell } from '@/components/layout/public-shell';
import { navMap } from '@/config/nav-map';

export default function PublicLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <PublicShell
      headerItems={visibleNavItems(navMap, 'public-header', null)}
      footerItems={visibleNavItems(navMap, 'public-footer', null)}
    >
      {children}
    </PublicShell>
  );
}
