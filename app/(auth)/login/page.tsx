// path: app/(auth)/login/page.tsx
import type { Metadata } from 'next';
import { getPublicEnv } from '@/lib/env/public';
import { LoginForm } from '../_components/login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage(): JSX.Element {
  return <LoginForm siteKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} />;
}
