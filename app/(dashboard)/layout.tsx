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
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/lib/platform/controls';
import { getMaintenance, maintenanceActive } from '@/services/platform/controls';
import { PLATFORM_ROLES } from '@/types/contracts';
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
  // Planned maintenance: company users see a notice; platform staff keep working.
  if (actor && !PLATFORM_ROLES.includes(actor.role) && (await maintenanceActive())) {
    const maintenance = await getMaintenance();
    return (
      <main className="mx-auto max-w-xl space-y-sp-8 p-sp-24 text-center" role="status">
        <h1 className="text-h3 font-semibold">Maintenance</h1>
        <p className="text-muted-foreground">
          {maintenance.message || DEFAULT_MAINTENANCE_MESSAGE}
        </p>
        {maintenance.endsAt ? (
          <p className="text-sm text-muted-foreground">
            Expected back: {maintenance.endsAt.replace('T', ' ').slice(0, 16)} UTC
          </p>
        ) : null}
      </main>
    );
  }
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
