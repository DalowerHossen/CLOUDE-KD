// path: app/(dashboard)/settings/company/page.tsx
import type { Metadata } from 'next';
import { SectionPage } from '@/components/settings/section-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Company profile' };

export default function Page(): Promise<JSX.Element> {
  return SectionPage({ section: 'profile', tab: 'company' });
}
