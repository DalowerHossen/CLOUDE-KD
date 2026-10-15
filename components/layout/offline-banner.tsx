// path: components/layout/offline-banner.tsx
'use client';

import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { t } from '@/lib/i18n';

/** Announces loss of connection to everyone, including screen readers. */
export function OfflineBanner(): JSX.Element | null {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-banner flex items-center justify-center gap-2 bg-warning px-sp-16 py-2 text-caption font-medium text-warning-foreground safe-top"
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      {t('s01Core.states.offline')}
    </div>
  );
}
