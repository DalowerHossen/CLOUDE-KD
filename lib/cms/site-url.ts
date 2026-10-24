// path: lib/cms/site-url.ts
// The public address of the site, from NEXT_PUBLIC_APP_URL, without a trailing slash.
import { getPublicEnv } from '@/lib/env/public';

export const siteUrl = (): string => new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;
export const absoluteUrl = (path: string): string =>
  `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
