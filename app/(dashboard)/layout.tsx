// path: app/(dashboard)/layout.tsx
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { essentialNavItems, visibleNavItems } from '@/components/layout/nav-utils';
import { getShellContext } from '@/components/layout/shell-user';
import { navMap } from '@/config/nav-map';
import { ESSENTIAL_NAV_IDS, MENU_MODE_COOKIE } from '@/config/nav-essential';
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
  const allItems = visibleNavItems(navMap, 'dashboard', role);
  const allAccountItems = visibleNavItems(navMap, 'account', role);
  const menuMode = (await cookies()).get(MENU_MODE_COOKIE)?.value === 'all' ? 'all' : 'essential';
  const items =
    menuMode === 'all' ? allItems : essentialNavItems(allItems, ESSENTIAL_NAV_IDS, role);
  const accountItems =
    menuMode === 'all'
      ? allAccountItems
      : essentialNavItems(allAccountItems, ESSENTIAL_NAV_IDS, role);
  const canToggleMenu =
    allItems.length + allAccountItems.length > items.length + accountItems.length ||
    menuMode === 'all';
  const notifications = items.find((item) => item.id === 'notifications')?.href ?? null;
  return (
    <AppShell
      items={items}
      accountItems={accountItems}
      user={user}
      homeHref="/dashboard"
      notificationsHref={notifications}
      menuMode={canToggleMenu ? menuMode : undefined}
    >
      <DeviceCollector />
      <ImpersonationBanner />
      {children}
    </AppShell>
  );
}
