// path: app/(public)/roadmap/page.tsx
import type { Metadata } from 'next';
import { CmsPage, cmsMetadata } from '@/components/marketing/cms-page';

export const revalidate = 300;

export function generateMetadata(): Promise<Metadata> {
  return cmsMetadata('roadmap');
}

export default function Page(): Promise<JSX.Element> {
  return CmsPage({ slug: 'roadmap' });
}
