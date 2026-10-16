// path: app/(public)/features/page.tsx
import type { Metadata } from 'next';
import { CmsPage, cmsMetadata } from '@/components/marketing/cms-page';

export const revalidate = 300;

export function generateMetadata(): Promise<Metadata> {
  return cmsMetadata('features');
}

export default function Page(): Promise<JSX.Element> {
  return CmsPage({ slug: 'features' });
}
