// path: lib/cms/reserved.ts
// First address segments that belong to the application, not to the CMS. A CMS page cannot use them.
import { PRIVATE_PREFIXES } from '@/config/seo';

const FIXED = [
  'api',
  'blog',
  'legal',
  'help',
  'tools',
  'status',
  'sitemap',
  'robots',
  'admin',
  'home',
  'index',
];

export function isReservedSlug(slug: string): boolean {
  const head = slug.split('/')[0] ?? slug;
  return FIXED.includes(head) || PRIVATE_PREFIXES.some((p) => `/${head}` === p.replace(/\/$/, ''));
}
