// path: components/layout/bottom-nav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import type { NavItem } from '@/config/nav-types';
import { t, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/stores/ui-store';
import { NavIconView } from './icon-map';
import { isActivePath } from './nav-utils';

/** Five-slot bottom bar for phones. Items marked bottomNav come first; the last slot opens the full menu. */
export function BottomNav({ items }: { items: readonly NavItem[] }): JSX.Element | null {
  const pathname = usePathname();
  const setDrawerOpen = useUiStore((s) => s.setMobileNavOpen);
  const marked = items.filter((item) => item.bottomNav && !item.parent);
  if (marked.length === 0 && items.length === 0) return null;
  const slots = (marked.length > 0 ? marked : items.filter((item) => !item.parent)).slice(0, 4);
  return (
    <nav
      aria-label={t('s01Core.nav.bottomNavigation')}
      className="fixed inset-x-0 bottom-0 z-sticky border-t bg-card safe-bottom safe-x md:hidden"
    >
      <ul className="grid grid-cols-5">
        {slots.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-caption',
                  active ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                <NavIconView name={item.icon} />
                <span className="max-w-full truncate">{t(item.labelKey as StringKey)}</span>
              </Link>
            </li>
          );
        })}
        <li style={{ gridColumn: `span ${5 - slots.length}` }}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 text-caption text-muted-foreground"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            <span>{t('s01Core.nav.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
