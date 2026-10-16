// path: app/(auth)/signup/page.tsx
import type { Metadata } from 'next';
import { getPublicEnv } from '@/lib/env/public';
import { SignupForm } from '../_components/signup-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create account' };

export default function SignupPage(): JSX.Element {
  return <SignupForm siteKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} />;
}
