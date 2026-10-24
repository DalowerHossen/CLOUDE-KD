// path: app/(auth)/login/two-factor/page.tsx
import type { Metadata } from 'next';
import { TwoFactorForm } from '../../_components/two-factor-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Two-step verification' };

export default function TwoFactorPage(): JSX.Element {
  return <TwoFactorForm />;
}
