// path: app/(auth)/login/two-factor-setup/page.tsx
import type { Metadata } from 'next';
import { TwoFactorSetup } from '../../_components/two-factor-setup';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set up two-step verification' };

export default function TwoFactorSetupPage(): JSX.Element {
  return <TwoFactorSetup />;
}
