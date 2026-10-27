// path: components/layout/auth-shell.tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NoticeBanner } from '@/components/shared/notice-banner';
import { t } from '@/lib/i18n';
import { Logo } from './logo';
import { SkipLink } from './skip-link';
import { ThemeToggle } from './theme-toggle';

/** Centered card layout for sign-in, sign-up, two-factor and reset pages. */
export function AuthShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/40 safe-top safe-bottom safe-x">
      <SkipLink />
      <header className="flex h-16 items-center justify-between px-sp-16">
        <Link
          href="/"
          aria-label={t('s01Core.brand.name')}
          className="inline-flex min-h-[44px] items-center rounded-md"
        >
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <NoticeBanner endpoint="/api/public-site/notices" />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-sp-16 py-sp-24 outline-none"
      >
        <div className="w-full max-w-md rounded-lg border bg-card p-sp-24 shadow-md md:p-sp-32">
          {children}
        </div>
      </main>
      <footer className="px-sp-16 py-sp-16 text-center text-caption text-muted-foreground">
        Copyright {new Date().getUTCFullYear()} {t('s01Core.brand.name')}.{' '}
        {t('s01Core.footer.rights')}
      </footer>
    </div>
  );
}
