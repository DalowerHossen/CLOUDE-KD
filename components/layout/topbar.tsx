// path: components/layout/topbar.tsx
'use client';

import Link from 'next/link';
import { Bell, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NavItem } from '@/config/nav-types';
import { t } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui-store';
import { Breadcrumbs } from './breadcrumbs';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { UserMenu, type ShellUser } from './user-menu';

interface TopbarProps {
  items: readonly NavItem[];
  accountItems: readonly NavItem[];
  user: ShellUser;
  homeHref: string;
  notificationsHref: string | null;
}

export function Topbar({
  items,
  accountItems,
  user,
  homeHref,
  notificationsHref,
}: TopbarProps): JSX.Element {
  const setDrawerOpen = useUiStore((s) => s.setMobileNavOpen);
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  return (
    <header className="sticky top-0 z-sticky flex h-16 items-center gap-2 border-b bg-background/95 px-sp-16 backdrop-blur safe-top safe-x supports-[backdrop-filter]:bg-background/80">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setDrawerOpen(true)}
        aria-label={t('s01Core.nav.openMenu')}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Link
        href={homeHref}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md md:hidden"
        aria-label={t('s01Core.brand.name')}
      >
        <Logo variant="icon" />
      </Link>
      <div className="hidden min-w-0 flex-1 md:block">
        <Breadcrumbs items={items} />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          className="hidden w-56 justify-start gap-2 text-muted-foreground md:inline-flex"
          onClick={() => setCommandOpen(true)}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 text-left">{t('s01Core.nav.searchShortcut')}</span>
          <kbd className="rounded-sm border bg-muted px-1.5 font-mono text-caption">Ctrl K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setCommandOpen(true)}
          aria-label={t('s01Core.nav.openSearch')}
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </Button>
        {notificationsHref ? (
          <Button variant="ghost" size="icon" asChild>
            <Link href={notificationsHref} aria-label={t('s01Core.nav.notifications')}>
              <Bell className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
        <ThemeToggle />
        <UserMenu user={user} accountItems={accountItems} />
      </div>
    </header>
  );
}
