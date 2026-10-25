// path: app/(auth)/verify-email/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
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
      <div className="space-y-sp-16">
        <ErrorState title={t('s03Auth.verify.title')} description={t('s03Auth.verify.failed')} />
        <Link
          href="/resend-verification"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('s03Auth.verify.resendTitle')}
        </Link>
      </div>
    );
  }
  return <VerifyEmailClient token={token} />;
}
