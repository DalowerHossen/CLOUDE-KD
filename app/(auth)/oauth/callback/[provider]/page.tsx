// path: app/(auth)/oauth/callback/[provider]/page.tsx
import type { Metadata } from 'next';
import { ErrorState } from '@/components/shared/state-views';
import { isOAuthProvider } from '@/lib/auth/oauth';
import { t } from '@/lib/i18n';
import { OAuthCallback } from '../../../_components/oauth-callback';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Finishing sign-in', referrer: 'no-referrer' };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

export default async function OAuthCallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<JSX.Element> {
  const { provider } = await params;
  const query = await searchParams;
  const code = one(query.code);
  const state = one(query.state);
  if (
    !isOAuthProvider(provider) ||
    code.length === 0 ||
    code.length > 2048 ||
    !/^[A-Za-z0-9_-]{20,100}$/.test(state)
  ) {
    return <ErrorState description={t('s03Auth.oauth.failed')} />;
  }
  return <OAuthCallback provider={provider} code={code} state={state} />;
}
