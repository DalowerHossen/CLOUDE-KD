// path: components/layout/breadcrumbs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { NavItem } from '@/config/nav-types';
import { t } from '@/lib/i18n';
import { buildBreadcrumbs } from './nav-utils';

export function Breadcrumbs({ items }: { items: readonly NavItem[] }): JSX.Element | null {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname, items);
  if (crumbs.length <= 1) return null;
  return (
    <nav aria-label={t('s01Core.nav.breadcrumbs')}>
      <ol className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm px-1 hover:text-foreground hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={index === crumbs.length - 1 ? 'page' : undefined}
                className={
                  index === crumbs.length - 1
                    ? 'inline-flex min-h-[44px] items-center px-1 font-medium text-foreground'
                    : 'inline-flex min-h-[44px] items-center px-1'
                }
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
