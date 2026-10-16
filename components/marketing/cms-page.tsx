// path: components/marketing/cms-page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pathOf } from '@/lib/cms/defaults';
import { loadPage } from '@/services/cms/page-loader';
import { BlockList } from './blocks/block-view';

/** Metadata of a CMS page: title, description and canonical address. */
export async function cmsMetadata(slug: string): Promise<Metadata> {
  const page = await loadPage(slug);
  if (!page) return {};
  return {
    title: slug === 'home' ? { absolute: `KD SOLUTION IT - ${page.title}` } : page.title,
    description: page.description,
    alternates: { canonical: pathOf(slug) },
    openGraph: {
      title: page.title,
      description: page.description,
      url: pathOf(slug),
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
  };
}

export async function CmsPage({ slug }: { slug: string }): Promise<JSX.Element> {
  const page = await loadPage(slug);
  if (!page) notFound();
  return <BlockList blocks={page.blocks} />;
}
