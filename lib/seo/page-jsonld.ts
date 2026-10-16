// path: lib/seo/page-jsonld.ts
// Which structured data a public page carries, decided from its slug and blocks.
import type { Block } from '@/lib/cms/blocks';
import { SITE_NAME } from '@/config/seo';
import {
  breadcrumbs,
  faqPage,
  jobPosting,
  organization,
  softwareApplication,
  webSite,
  type JsonLdObject,
} from './jsonld';
import type { SeoSettings } from './settings';

const FALLBACK_DATE = '2026-10-01';

export function pageJsonLd(
  origin: string,
  slug: string,
  title: string,
  blocks: readonly Block[],
  settings: SeoSettings,
  updatedAt: string | null,
): JsonLdObject[] {
  const out: JsonLdObject[] = [];
  if (slug === 'home') {
    out.push(organization(origin, settings), webSite(origin), softwareApplication(origin));
  } else {
    const trail = slug.startsWith('legal/')
      ? [
          { name: SITE_NAME, path: '/' },
          { name: 'Legal', path: '/legal' },
          { name: title, path: `/${slug}` },
        ]
      : [
          { name: SITE_NAME, path: '/' },
          { name: title, path: `/${slug}` },
        ];
    out.push(breadcrumbs(origin, trail));
    if (slug === 'pricing' || slug === 'features') out.push(softwareApplication(origin));
  }
  const faq = blocks.flatMap((b) => (b.type === 'faq' ? b.items : []));
  if (faq.length > 0) out.push(faqPage(faq));
  for (const b of blocks)
    if (b.type === 'jobs')
      for (const job of b.items)
        out.push(jobPosting(origin, job, (updatedAt ?? FALLBACK_DATE).slice(0, 10)));
  return out;
}
