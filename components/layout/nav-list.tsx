// path: components/layout/nav-list.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/config/nav-types';
import { cn } from '@/lib/utils/cn';
import { t, type StringKey } from '@/lib/i18n';
import { NavIconView } from './icon-map';
import { isActivePath } from './nav-utils';

interface NavListProps {
  items: readonly NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Vertical list of navigation links used by the sidebar and the mobile drawer. */
export function NavList({ items, collapsed = false, onNavigate }: NavListProps): JSX.Element {
  const pathname = usePathname();
  const top = items.filter((item) => !item.parent);
  const childrenOf = (id: string): NavItem[] => items.filter((item) => item.parent === id);
  return (
    <ul className="space-y-1">
      {top.map((item) => {
        const active = isActivePath(pathname, item.href);
        const children = childrenOf(item.id);
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active && children.length === 0 ? 'page' : undefined}
              title={collapsed ? t(item.labelKey as StringKey) : undefined}
              className={cn(
                'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors duration-fast ease-standard hover:bg-accent hover:text-accent-foreground',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                collapsed && 'justify-center px-2',
              )}
            >
              <NavIconView name={item.icon} />
              <span className={cn(collapsed && 'sr-only')}>{t(item.labelKey as StringKey)}</span>
            </Link>
            {children.length > 0 && !collapsed ? (
              <ul className="ml-6 mt-1 space-y-1 border-l pl-3">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={isActivePath(pathname, child.href) ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[44px] items-center rounded-md px-3 py-2 text-base transition-colors duration-fast hover:bg-accent hover:text-accent-foreground',
                        isActivePath(pathname, child.href)
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {t(child.labelKey as StringKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
