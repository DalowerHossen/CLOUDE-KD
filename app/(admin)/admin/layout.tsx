// path: app/(admin)/admin/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { visibleNavItems } from '@/components/layout/nav-utils';
import { getShellContext } from '@/components/layout/shell-user';
import { navMap } from '@/config/nav-map';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const { user, role } = await getShellContext('admin');
  const items = visibleNavItems(navMap, 'admin', role);
  const accountItems = visibleNavItems(navMap, 'account', role);
  const notifications = items.find((item) => item.id === 'admin-notifications')?.href ?? null;
  return (
    <AppShell
      items={items}
      accountItems={accountItems}
      user={user}
      homeHref="/admin"
      notificationsHref={notifications}
      badge={t('s01Core.nav.adminBadge')}
    >
      {children}
    </AppShell>
  );
}
