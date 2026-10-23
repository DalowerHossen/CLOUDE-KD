// path: lib/billing/links.ts
// Addresses of the client pages (STEP 13 serves them). A page is opened with a token that is shown once.
import { siteUrl } from '@/lib/cms/site-url';

export const invoiceLink = (token: string): string => `${siteUrl()}/i/${encodeURIComponent(token)}`;
export const estimateLink = (token: string): string =>
  `${siteUrl()}/e/${encodeURIComponent(token)}`;
