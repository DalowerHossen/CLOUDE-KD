// path: app/(public)/legal/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlockList } from '@/components/marketing/blocks/block-view';
import { cmsMetadata } from '@/components/marketing/cms-page';
import { JsonLd } from '@/components/marketing/json-ld';
import { LegalMeta } from '@/components/marketing/legal-meta';
import { siteUrl } from '@/lib/cms/site-url';
import { pageJsonLd } from '@/lib/seo/page-jsonld';
import { readSeoSettings } from '@/services/seo/settings';
import { LEGAL_SLUGS, currentLegalVersion } from '@/services/cms/legal';
import { loadPage } from '@/services/cms/page-loader';

export const revalidate = 300;
// The twelve legal pages are fixed; an unknown address answers with a real 404.
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return cmsMetadata(`legal/${(await params).slug}`);
}

export default async function LegalPage({ params }: Props): Promise<JSX.Element> {
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();
  const page = await loadPage(`legal/${slug}`);
  if (!page) notFound();
  const version = await currentLegalVersion(slug);
  const [hero, ...rest] = page.blocks;
  const settings = await readSeoSettings();
  return (
    <>
      <JsonLd
        data={pageJsonLd(
          siteUrl(),
          `legal/${slug}`,
          page.title,
          page.blocks,
          settings,
          page.updatedAt,
        )}
      />
      {hero ? <BlockList blocks={[hero]} /> : null}
      <LegalMeta slug={slug} version={version.version} effective={version.effective} />
      <BlockList blocks={rest} />
    </>
  );
}
