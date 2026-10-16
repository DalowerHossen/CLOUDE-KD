// path: app/(auth)/_components/oauth-callback.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ErrorState, LoadingState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { postJson } from './auth-client';

const outcome = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), redirectTo: z.enum(['/dashboard', '/admin']) }),
  z.object({ status: z.literal('two_factor_required') }),
  z.object({ status: z.literal('two_factor_setup_required') }),
  z.object({ status: z.literal('linked') }),
  z.object({ status: z.literal('link_required') }),
]);

export function OAuthCallback({
  provider,
  code,
  state,
}: {
  provider: string;
  code: string;
  state: string;
}): JSX.Element {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    postJson(`/api/auth/oauth/${provider}/callback`, { code, state }, outcome).then((result) => {
      if (!result.ok) return setFailure(t('s03Auth.oauth.failed'));
      const data = result.data;
      if (data.status === 'ok') router.replace(data.redirectTo);
      else if (data.status === 'two_factor_required') router.replace('/login/two-factor');
      else if (data.status === 'two_factor_setup_required')
        router.replace('/login/two-factor-setup');
      else if (data.status === 'linked') router.replace('/account/security');
      else setFailure(t('s03Auth.oauth.linkRequired'));
    });
  }, [provider, code, state, router]);

  if (failure) {
    return (
      <div className="space-y-sp-16">
        <ErrorState description={failure} />
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('s03Auth.common.backToLogin')}
        </Link>
      </div>
    );
  }
  return (
    <div aria-live="polite">
      <p className="mb-sp-12 text-sm text-muted-foreground">{t('s03Auth.oauth.working')}</p>
      <LoadingState rows={2} />
    </div>
  );
}
