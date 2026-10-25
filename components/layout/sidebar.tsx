// path: components/layout/sidebar.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, ListChecks, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MENU_MODE_COOKIE } from '@/config/nav-essential';
import type { NavItem } from '@/config/nav-types';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/stores/ui-store';
import { Logo } from './logo';
import { NavList } from './nav-list';

interface SidebarProps {
  items: readonly NavItem[];
  homeHref: string;
  badge?: string;
  menuMode?: 'essential' | 'all';
}

/** Desktop sidebar (md and up). Phones use the drawer and the bottom navigation instead. */
export function Sidebar({ items, homeHref, badge, menuMode }: SidebarProps): JSX.Element {
  const router = useRouter();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  return (
    <aside
      aria-label={t('s01Core.nav.mainNavigation')}
      className={cn(
        'sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r bg-card transition-[width] duration-base ease-standard md:flex',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      <div
        className={cn('flex h-16 items-center border-b px-4', collapsed && 'justify-center px-2')}
      >
        <Link
          href={homeHref}
          aria-label={t('s01Core.brand.name')}
          className="inline-flex min-h-[44px] items-center rounded-md"
        >
          <Logo variant={collapsed ? 'icon' : 'full'} />
        </Link>
        {badge && !collapsed ? (
          <span className="ml-2 rounded-sm bg-primary px-1.5 py-0.5 text-caption font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      <nav className="flex-1 overflow-y-auto p-3" aria-label={t('s01Core.nav.mainNavigation')}>
        <NavList items={items} collapsed={collapsed} />
      </nav>
      <div className="space-y-1 border-t p-3">
        {menuMode ? (
          <Button
            variant="ghost"
            className={cn('w-full justify-start gap-3', collapsed && 'justify-center')}
            onClick={() => {
              const next = menuMode === 'all' ? 'essential' : 'all';
              document.cookie = `${MENU_MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
              router.refresh();
            }}
          >
            {menuMode === 'all' ? (
              <ListChecks className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ListTree className="h-5 w-5" aria-hidden="true" />
            )}
            <span className={cn(collapsed && 'sr-only')}>
              {menuMode === 'all'
                ? t('s01Core.nav.showEssentialMenu')
                : t('s01Core.nav.showAllFeatures')}
            </span>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className={cn('w-full justify-start gap-3', collapsed && 'justify-center')}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t('s01Core.nav.expandSidebar') : t('s01Core.nav.collapseSidebar')}
          aria-pressed={collapsed}
        >
          {collapsed ? (
            <ChevronsRight className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="h-5 w-5" aria-hidden="true" />
          )}
          <span className={cn(collapsed && 'sr-only')}>{t('s01Core.nav.collapseSidebar')}</span>
        </Button>
      </div>
    </aside>
  );
}
