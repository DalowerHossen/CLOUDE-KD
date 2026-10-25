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
  '/resend-verification',
  '/unlock',
  '/join',
  // Tokenised client links: one-letter folders end with a slash so that public pages such as /contact stay open.
  '/c/',
  '/e/',
  '/i/',
  '/p/',
  '/r/',
  '/skyc/',
  '/hub',
  '/expired',
  '/oauth',
  '/portal',
  '/pay',
  '/dev',
  // Pages behind the sign-in.
  '/announcements',
  '/bills',
  '/client-mail',
  '/clients',
  '/contracts',
  '/credit-notes',
  '/disputes',
  '/estimates',
  '/expenses',
  '/feedback',
  '/hr',
  '/imports',
  '/integrations',
  '/inventory',
  '/invoices',
  '/migration',
  '/onboarding',
  '/products',
  '/projects',
  '/purchase-orders',
  '/reports',
  '/social',
  '/subscriptions',
  '/suppliers',
  '/support',
  '/team',
  '/timesheets',
  '/wallet',
  '/whatsapp',
];

/** Limits the audit checks against (characters). */
export const SEO_LIMITS = {
  titleMin: 10,
  titleMax: 60,
  descriptionMin: 70,
  descriptionMax: 160,
} as const;
