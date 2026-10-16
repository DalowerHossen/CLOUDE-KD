// path: components/marketing/site-header.tsx
'use client';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

interface Props {
  items: readonly NavItem[];
}

const label = (item: NavItem): string => t(item.labelKey as StringKey);
/** A description is shown under a menu entry when the string "<label key>Description" exists. */
function description(item: NavItem): string | null {
  const key = `${item.labelKey}Description` as StringKey;
  const text = t(key);
  return text === key ? null : text;
}

/** Header with a mega menu. Top-level items with children open a panel; the children are items whose `parent` is the top item's id. */
export function SiteHeader({ items }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const top = items.filter((i) => !i.parent);
  const childrenOf = (id: string): NavItem[] => items.filter((i) => i.parent === id);
  return (
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
            {top.map((item) => {
              const kids = childrenOf(item.id);
              return (
                <li key={item.id}>
                  {kids.length === 0 ? (
                    <Link
                      href={item.href}
                      className="inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {label(item)}
                    </Link>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {label(item)}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[28rem] max-w-[90vw]">
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {kids.map((kid) => (
                            <li key={kid.id}>
                              <Link
                                href={kid.href}
                                className="block min-h-[44px] rounded-md p-2 hover:bg-accent"
                              >
                                <span className="block text-sm font-medium">{label(kid)}</span>
                                {description(kid) ? (
                                  <span className="block text-xs text-muted-foreground">
                                    {description(kid)}
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                        <Link
                          href={item.href}
                          className="mt-2 inline-block text-xs text-primary hover:underline"
                        >
                          {t('s06Public.header.more', { section: label(item) })}
                        </Link>
                      </PopoverContent>
                    </Popover>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">{t('s06Public.header.signIn')}</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/signup">{t('s06Public.header.getStarted')}</Link>
          </Button>
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t('s06Public.header.menu')}
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
              <nav aria-label={t('s01Core.nav.mainNavigation')} className="mt-6 space-y-sp-12">
                <ul className="space-y-1">
                  {top.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex min-h-[44px] items-center rounded-md px-3 text-base font-medium hover:bg-accent"
                      >
                        {label(item)}
                      </Link>
                      {childrenOf(item.id).length > 0 ? (
                        <ul className="ml-3 border-l pl-2">
                          {childrenOf(item.id).map((kid) => (
                            <li key={kid.id}>
                              <Link
                                href={kid.href}
                                onClick={() => setOpen(false)}
                                className="flex min-h-[44px] items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent"
                              >
                                {label(kid)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2">
                  <Button asChild variant="outline">
                    <Link href="/login" onClick={() => setOpen(false)}>
                      {t('s06Public.header.signIn')}
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href="/signup" onClick={() => setOpen(false)}>
                      {t('s06Public.header.getStarted')}
                    </Link>
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
