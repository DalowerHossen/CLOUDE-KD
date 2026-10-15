// path: components/layout/public-shell.tsx
'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { NavItem } from '@/config/nav-types';
import { t, type StringKey } from '@/lib/i18n';
import { Logo } from './logo';
import { SkipLink } from './skip-link';
import { ThemeToggle } from './theme-toggle';

interface PublicShellProps {
  headerItems: readonly NavItem[];
  footerItems: readonly NavItem[];
  children: ReactNode;
}

/** Marketing site shell. Header and footer links come from the navigation fragments (groups public-header and public-footer). */
export function PublicShell({ headerItems, footerItems, children }: PublicShellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <header className="sticky top-0 z-sticky border-b bg-background/95 backdrop-blur safe-top safe-x supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-sp-16">
          <Link
            href="/"
            aria-label={t('s01Core.brand.name')}
            className="inline-flex min-h-[44px] items-center rounded-md"
          >
            <Logo />
          </Link>
          <nav aria-label={t('s01Core.nav.mainNavigation')} className="ml-6 hidden flex-1 md:block">
            <ul className="flex items-center gap-1">
              {headerItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t(item.labelKey as StringKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={t('s01Core.nav.openMenu')}
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>{t('s01Core.brand.name')}</SheetTitle>
                  <SheetDescription className="sr-only">
                    {t('s01Core.nav.mainNavigation')}
                  </SheetDescription>
                </SheetHeader>
                <nav aria-label={t('s01Core.nav.mainNavigation')} className="mt-6">
                  <ul className="space-y-1">
                    {headerItems.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex min-h-[44px] items-center rounded-md px-3 text-base font-medium hover:bg-accent"
                        >
                          {t(item.labelKey as StringKey)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t bg-card safe-bottom safe-x">
        <div className="mx-auto flex max-w-7xl flex-col gap-sp-16 px-sp-16 py-sp-32 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Logo />
            <p className="max-w-sm text-caption text-muted-foreground">
              {t('s01Core.brand.tagline')}
            </p>
          </div>
          <nav aria-label={t('s01Core.footer.rights')}>
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {footerItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-[44px] items-center text-caption text-muted-foreground hover:text-foreground"
                  >
                    {t(item.labelKey as StringKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="border-t py-sp-16 text-center text-caption text-muted-foreground">
          Copyright {new Date().getUTCFullYear()} {t('s01Core.brand.name')}.{' '}
          {t('s01Core.footer.rights')}
        </div>
      </footer>
    </div>
  );
}
