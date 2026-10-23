// path: app/(public)/careers/page.tsx
import type { Metadata } from 'next';
import { CmsPage, cmsMetadata } from '@/components/marketing/cms-page';

export const revalidate = 300;

export function generateMetadata(): Promise<Metadata> {
  return cmsMetadata('careers');
}

export default function Page(): Promise<JSX.Element> {
  return CmsPage({ slug: 'careers' });
}
