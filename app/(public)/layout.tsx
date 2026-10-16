// path: app/(public)/layout.tsx
import type { ReactNode } from 'react';
import { visibleNavItems } from '@/components/layout/nav-utils';
import { PublicFrame } from '@/components/marketing/public-frame';
import { navMap } from '@/config/nav-map';

export default function PublicLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <PublicFrame
      headerItems={visibleNavItems(navMap, 'public-header', null)}
      footerItems={visibleNavItems(navMap, 'public-footer', null)}
    >
      {children}
    </PublicFrame>
  );
}
