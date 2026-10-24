// path: components/marketing/cms-page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pathOf } from '@/lib/cms/defaults';
import { loadPage } from '@/services/cms/page-loader';
import { siteUrl } from '@/lib/cms/site-url';
import { pageJsonLd } from '@/lib/seo/page-jsonld';
import { readSeoSettings } from '@/services/seo/settings';
import { BlockList } from './blocks/block-view';
import { JsonLd } from './json-ld';

/** Metadata of a CMS page: title, description and canonical address. */
export async function cmsMetadata(slug: string): Promise<Metadata> {
  const page = await loadPage(slug);
  if (!page) return {};
  return {
    title: slug === 'home' ? { absolute: `KD SOLUTION IT - ${page.title}` } : page.title,
    description: page.description,
    alternates: { canonical: pathOf(slug) },
    ...(page.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: page.title,
      description: page.description,
      url: pathOf(slug),
      type: 'website',
      images: [{ url: `/api/seo/og/page/${slug}`, width: 1200, height: 630, alt: page.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
      images: [`/api/seo/og/page/${slug}`],
    },
  };
}

export async function CmsPage({ slug }: { slug: string }): Promise<JSX.Element> {
  const page = await loadPage(slug);
  if (!page) notFound();
  const settings = await readSeoSettings();
  return (
    <>
      <JsonLd
        data={pageJsonLd(siteUrl(), slug, page.title, page.blocks, settings, page.updatedAt)}
      />
      <BlockList blocks={page.blocks} />
    </>
  );
}
