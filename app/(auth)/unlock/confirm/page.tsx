// path: app/(auth)/unlock/confirm/page.tsx
import type { Metadata } from 'next';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { UnlockConfirm } from '../../_components/unlock-confirm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confirm account unlock', referrer: 'no-referrer' };

export default async function UnlockConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const raw = (await searchParams).t;
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    return (
      <ErrorState
        title={t('s03Auth.unlockConfirm.title')}
        description={t('s03Auth.unlockConfirm.failed')}
      />
    );
  }
  return <UnlockConfirm token={token} />;
}
