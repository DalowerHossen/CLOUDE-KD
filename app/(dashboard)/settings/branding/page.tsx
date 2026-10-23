// path: app/(dashboard)/settings/branding/page.tsx
import type { Metadata } from 'next';
import { SectionPage } from '@/components/settings/section-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Branding' };

export default function Page(): Promise<JSX.Element> {
  return SectionPage({ section: 'branding', tab: 'branding' });
}
