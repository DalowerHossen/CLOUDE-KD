// path: app/(auth)/resend-verification/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicEnv } from '@/lib/env/public';
import { t } from '@/lib/i18n';
import { ResendForm } from '../_components/resend-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Send a new confirmation link',
  referrer: 'no-referrer',
};

export default function ResendVerificationPage(): JSX.Element {
  return (
    <div className="space-y-sp-16">
      <ResendForm siteKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      <Link
        href="/login"
        className="inline-flex min-h-[44px] items-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t('s03Auth.common.backToLogin')}
      </Link>
    </div>
  );
}
