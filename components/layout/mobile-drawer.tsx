// path: components/layout/mobile-drawer.tsx
'use client';

import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { NavItem } from '@/config/nav-types';
import { t } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui-store';
import { Logo } from './logo';
import { NavList } from './nav-list';

/** Slide-in navigation for phones, opened from the top bar or the bottom navigation. */
export function MobileDrawer({
  items,
  homeHref,
}: {
  items: readonly NavItem[];
  homeHref: string;
}): JSX.Element {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="flex flex-col gap-4 overflow-y-auto p-sp-16">
        <SheetHeader>
          <SheetTitle>
            <Link
              href={homeHref}
              onClick={() => setOpen(false)}
              aria-label={t('s01Core.brand.name')}
              className="inline-flex min-h-[44px] items-center rounded-md"
            >
              <Logo />
            </Link>
          </SheetTitle>
          <SheetDescription className="sr-only">{t('s01Core.nav.mainNavigation')}</SheetDescription>
        </SheetHeader>
        <nav aria-label={t('s01Core.nav.mainNavigation')}>
          <NavList items={items} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
