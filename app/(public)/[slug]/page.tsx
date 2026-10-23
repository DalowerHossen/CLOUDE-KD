// path: app/(public)/[slug]/page.tsx
// Pages that staff add in the CMS under a single address (for example /partners). Fixed pages have their own
// folders, which always win over this route.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CmsPage, cmsMetadata } from '@/components/marketing/cms-page';
import { isReservedSlug } from '@/lib/cms/reserved';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

const SLUG = /^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/;

function check(slug: string): string {
  if (!SLUG.test(slug) || isReservedSlug(slug)) notFound();
  return slug;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return cmsMetadata(check((await params).slug));
}

export default async function CmsCatchAllPage({ params }: Props): Promise<JSX.Element> {
  return CmsPage({ slug: check((await params).slug) });
}
