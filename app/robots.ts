// path: app/robots.ts
import type { MetadataRoute } from 'next';
import { PRIVATE_PREFIXES } from '@/config/seo';
import { absoluteUrl } from '@/lib/cms/site-url';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
