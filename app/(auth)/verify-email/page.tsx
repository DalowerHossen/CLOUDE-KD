// path: app/(auth)/verify-email/page.tsx
import type { Metadata } from 'next';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { VerifyEmailClient } from '../_components/verify-email-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confirm e-mail address', referrer: 'no-referrer' };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<JSX.Element> {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(token)) {
    return (
      <ErrorState title={t('s03Auth.verify.title')} description={t('s03Auth.verify.failed')} />
    );
  }
  return <VerifyEmailClient token={token} />;
}
