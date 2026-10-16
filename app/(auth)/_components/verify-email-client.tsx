// path: app/(auth)/_components/verify-email-client.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { ErrorState, LoadingState, SuccessState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';

type State = 'working' | 'ok' | 'failed';

export function VerifyEmailClient({ token }: { token: string }): JSX.Element {
  const [state, setState] = useState<State>('working');

  useEffect(() => {
    let active = true;
    postJson(
      '/api/auth/verify-email',
      { tokenHash: token },
      z.object({ verified: z.boolean() }),
    ).then((result) => {
      if (active) setState(result.ok && result.data.verified ? 'ok' : 'failed');
    });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="space-y-sp-16" aria-live="polite">
      <h1 className="sr-only">{t('s03Auth.verify.title')}</h1>
      {state === 'working' ? <LoadingState rows={2} /> : null}
      {state === 'ok' ? (
        <SuccessState title={t('s03Auth.verify.title')} description={t('s03Auth.verify.ok')} />
      ) : null}
      {state === 'failed' ? (
        <ErrorState title={t('s03Auth.verify.title')} description={t('s03Auth.verify.failed')} />
      ) : null}
      <Link
        href="/login"
        className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t('s03Auth.common.backToLogin')}
      </Link>
    </div>
  );
}
