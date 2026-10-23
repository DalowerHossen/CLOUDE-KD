// path: app/(dashboard)/settings/display/page.tsx
import type { Metadata } from 'next';
import { SectionPage } from '@/components/settings/section-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Display settings' };

export default function Page(): Promise<JSX.Element> {
  return SectionPage({ section: 'display', tab: 'display' });
}
