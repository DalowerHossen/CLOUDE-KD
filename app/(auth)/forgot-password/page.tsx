// path: app/(auth)/forgot-password/page.tsx
import type { Metadata } from 'next';
import { getPublicEnv } from '@/lib/env/public';
import { ForgotForm } from '../_components/forgot-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage(): JSX.Element {
  return <ForgotForm siteKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} />;
}
