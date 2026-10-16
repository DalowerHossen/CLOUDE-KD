// path: config/seo.ts
// Fixed facts of the site for search engines and crawlers.
export const SITE_NAME = 'KD SOLUTION IT';
export const SITE_TAGLINE = 'Invoicing, payments, payroll and accounting for growing businesses.';

/** Address prefixes that belong to the signed-in product, to tokenized links or to the API. Crawlers must stay out. */
export const PRIVATE_PREFIXES: readonly string[] = [
  '/api/',
  '/admin',
  '/dashboard',
  '/account',
  '/approvals',
  '/notifications',
  '/settings',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/unlock',
  '/oauth',
  '/portal',
  '/pay',
  '/dev',
];

/** Limits the audit checks against (characters). */
export const SEO_LIMITS = {
  titleMin: 10,
  titleMax: 60,
  descriptionMin: 70,
  descriptionMax: 160,
} as const;
