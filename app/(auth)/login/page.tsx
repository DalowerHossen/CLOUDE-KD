// path: app/(auth)/login/page.tsx
import type { Metadata } from 'next';
import { getPublicEnv } from '@/lib/env/public';
import { enabledProviders } from '@/services/auth/oauth-flow';
import { LoginForm } from '../_components/login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage(): Promise<JSX.Element> {
  const providers = await enabledProviders().catch(() => []);
  return (
    <LoginForm siteKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} providers={providers} />
  );
}
