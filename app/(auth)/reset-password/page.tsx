// path: app/(auth)/reset-password/page.tsx
import type { Metadata } from 'next';
import { ErrorState } from '@/components/shared/state-views';
import { getPublicEnv } from '@/lib/env/public';
import { t } from '@/lib/i18n';
import { ResetForm } from '../_components/reset-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<JSX.Element> {
  const params = await searchParams;
  const identifier = one(params.i);
  const token = one(params.t);
  if (!/^[0-9a-f]{64}$/.test(identifier) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    return (
      <ErrorState title={t('s03Auth.reset.title')} description={t('s03Auth.reset.invalidLink')} />
    );
  }
  return (
    <ResetForm
      siteKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      identifier={identifier}
      token={token}
    />
  );
}
