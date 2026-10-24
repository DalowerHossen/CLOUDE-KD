// path: app/(admin)/admin/impersonation/_components/end-impersonation-button.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export function EndImpersonationButton(): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function end(): Promise<void> {
    setBusy(true);
    try {
      await fetch('/api/auth/impersonation/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={end}>
      {t('s03Auth.impersonation.end')}
    </Button>
  );
}
