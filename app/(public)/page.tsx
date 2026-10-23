// path: app/(public)/page.tsx
import type { Metadata } from 'next';
import { CmsPage, cmsMetadata } from '@/components/marketing/cms-page';

export const revalidate = 300;

export function generateMetadata(): Promise<Metadata> {
  return cmsMetadata('home');
}

export default function HomePage(): Promise<JSX.Element> {
  return CmsPage({ slug: 'home' });
}
