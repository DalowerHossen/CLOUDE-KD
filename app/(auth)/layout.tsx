// path: app/(auth)/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthShell } from '@/components/layout/auth-shell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return <AuthShell>{children}</AuthShell>;
}
