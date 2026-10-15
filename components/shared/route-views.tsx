// path: components/shared/route-views.tsx
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger/logger';
import { t } from '@/lib/i18n';
import { ErrorState, LoadingState } from './state-views';

/** Body of every route-group `error.tsx`. Shows a friendly message and the digest as a reference. */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    logger.error('route error boundary', { digest: error.digest, name: error.name });
  }, [error]);
  return (
    <div className="mx-auto max-w-xl py-sp-48">
      <ErrorState reference={error.digest} onRetry={reset} />
    </div>
  );
}

/** Body of every route-group `loading.tsx`. */
export function RouteLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl py-sp-24">
      <LoadingState rows={5} />
    </div>
  );
}

/** Body of every route-group `not-found.tsx`. */
export function RouteNotFound({ homeHref = '/' }: { homeHref?: string }): JSX.Element {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-sp-16 py-sp-48 text-center">
      <p className="text-display font-bold text-primary" aria-hidden="true">
        404
      </p>
      <h1 className="text-h2 font-semibold">{t('s01Core.errors.notFoundTitle')}</h1>
      <p className="text-base text-muted-foreground">{t('s01Core.errors.notFoundBody')}</p>
      <Button asChild>
        <Link href={homeHref}>{t('s01Core.errors.notFoundAction')}</Link>
      </Button>
    </div>
  );
}
