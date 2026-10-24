// path: app/(auth)/_components/unlock-confirm.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorState, SuccessState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';

export function UnlockConfirm({ token }: { token: string }): JSX.Element {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'failed'>('idle');

  async function confirm(): Promise<void> {
    setState('busy');
    const result = await postJson(
      '/api/auth/unlock/confirm',
      { token },
      z.object({ confirmed: z.boolean() }),
    );
    setState(result.ok && result.data.confirmed ? 'ok' : 'failed');
  }

  if (state === 'ok')
    return (
      <SuccessState
        title={t('s03Auth.unlockConfirm.title')}
        description={t('s03Auth.unlockConfirm.ok')}
      />
    );
  if (state === 'failed')
    return (
      <ErrorState
        title={t('s03Auth.unlockConfirm.title')}
        description={t('s03Auth.unlockConfirm.failed')}
      />
    );
  return (
    <div className="space-y-sp-16">
      <h1 className="text-h3 font-semibold">{t('s03Auth.unlockConfirm.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('s03Auth.unlockConfirm.body')}</p>
      <Button type="button" className="w-full" disabled={state === 'busy'} onClick={confirm}>
        {t('s03Auth.unlockConfirm.action')}
      </Button>
    </div>
  );
}
