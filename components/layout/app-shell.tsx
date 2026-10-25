// path: components/layout/app-shell.tsx
'use client';

import type { ReactNode } from 'react';
import type { NavItem } from '@/config/nav-types';
import { Breadcrumbs } from './breadcrumbs';
import { BottomNav } from './bottom-nav';
import { CommandPalette } from './command-palette';
import { MobileDrawer } from './mobile-drawer';
import { ShortcutsDialog } from './shortcuts-dialog';
import { Sidebar } from './sidebar';
import { SkipLink } from './skip-link';
import { Topbar } from './topbar';
import type { ShellUser } from './user-menu';

export interface AppShellProps {
  /** Items the signed-in role may see (already filtered on the server). */
  items: readonly NavItem[];
  /** Items for the account menu (group "account"). */
  accountItems: readonly NavItem[];
  user: ShellUser;
  homeHref: string;
  notificationsHref: string | null;
  /** Short or full menu; undefined when the role has no short menu. */
  menuMode?: 'essential' | 'all';
  /** Small label next to the logo, for example "Admin". */
  badge?: string;
  children: ReactNode;
}

/** Shell for the dashboard and admin areas: sidebar, top bar, mobile drawer, bottom navigation. */
export function AppShell({
  items,
  accountItems,
  user,
  homeHref,
  notificationsHref,
  menuMode,
  badge,
  children,
}: AppShellProps): JSX.Element {
  return (
    <div className="flex min-h-[100dvh]">
      <SkipLink />
      <Sidebar items={items} homeHref={homeHref} badge={badge} menuMode={menuMode} />
      <MobileDrawer items={items} homeHref={homeHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          items={items}
          accountItems={accountItems}
          user={user}
          homeHref={homeHref}
          notificationsHref={notificationsHref}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-sp-16 py-sp-24 pb-24 outline-none safe-x md:px-sp-32 md:pb-sp-32"
        >
          <div className="mb-sp-16 md:hidden">
            <Breadcrumbs items={items} />
          </div>
          {children}
        </main>
      </div>
      <BottomNav items={items} />
      <CommandPalette items={items} />
      <ShortcutsDialog />
    </div>
  );
}
