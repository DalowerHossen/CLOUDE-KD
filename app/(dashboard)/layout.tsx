// path: app/(dashboard)/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { visibleNavItems } from '@/components/layout/nav-utils';
import { getShellContext } from '@/components/layout/shell-user';
import { navMap } from '@/config/nav-map';
import { DeviceCollector } from '@/lib/security/device-collector';
import { ImpersonationBanner } from '../(admin)/admin/impersonation/_components/impersonation-banner';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const { user, role } = await getShellContext('dashboard');
  const items = visibleNavItems(navMap, 'dashboard', role);
  const accountItems = visibleNavItems(navMap, 'account', role);
  const notifications = items.find((item) => item.id === 'notifications')?.href ?? null;
  return (
    <AppShell
      items={items}
      accountItems={accountItems}
      user={user}
      homeHref="/dashboard"
      notificationsHref={notifications}
    >
      <DeviceCollector />
      <ImpersonationBanner />
      {children}
    </AppShell>
  );
}
