// path: components/layout/portal-shell.tsx
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { Logo } from './logo';
import { SkipLink } from './skip-link';

interface PortalShellProps {
  children: ReactNode;
  /** Company name shown instead of the platform name once tenant branding is applied (STEP 13). */
  brandName?: string;
  /** Hides the platform footer line for white-label plans. */
  hidePlatformMark?: boolean;
}

/** Minimal shell for tokenized client pages. No navigation, no account menu, no analytics. */
export function PortalShell({
  children,
  brandName,
  hidePlatformMark = false,
}: PortalShellProps): JSX.Element {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/40 safe-top safe-bottom safe-x">
      <SkipLink />
      <header className="flex h-16 items-center justify-center border-b bg-card px-sp-16">
        {brandName ? <span className="text-lead font-semibold">{brandName}</span> : <Logo />}
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-sp-16 py-sp-24 outline-none"
      >
        {children}
      </main>
      {hidePlatformMark ? null : (
        <footer className="px-sp-16 py-sp-16 text-center text-caption text-muted-foreground">
          {t('s01Core.footer.poweredBy')}
        </footer>
      )}
    </div>
  );
}
