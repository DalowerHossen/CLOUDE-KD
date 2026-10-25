// path: app/(dashboard)/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { visibleNavItems } from '@/components/layout/nav-utils';
import { getShellContext } from '@/components/layout/shell-user';
import { moduleOfNavItem } from '@/config/features';
import { navMap } from '@/config/nav-map';
import { DeviceCollector } from '@/lib/security/device-collector';
import { currentActor } from '@/services/auth/actor';
import { enabledModules } from '@/services/company/module-access';
import { ImpersonationBanner } from '../(admin)/admin/impersonation/_components/impersonation-banner';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const { user, role } = await getShellContext('dashboard');
  const actor = await currentActor();
  // An optional module that the super admin has not turned on for this company is not in the menu.
  const on = actor?.companyId ? await enabledModules(actor.companyId) : new Set<string>();
  const shown = <T extends { id: string }>(item: T): boolean => {
    const mod = moduleOfNavItem(item.id);
    return mod === null || on.has(mod.key);
  };
  const items = visibleNavItems(navMap, 'dashboard', role).filter(shown);
  const accountItems = visibleNavItems(navMap, 'account', role).filter(shown);
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
