// path: lib/cms/legal-pages.ts
// Which legal pages exist and which of them a visitor can accept. Safe to import in the browser.
import type { StringKey } from '@/lib/i18n';

export const ACCEPTABLE_PAGES: readonly string[] = [
  'terms',
  'privacy',
  'refunds',
  'acceptable-use',
  'dpa',
];

/** Legal pages in the order they are listed, with the short name shown in links. */
export const LEGAL_LINKS: readonly { slug: string; labelKey: StringKey }[] = [
  { slug: 'terms', labelKey: 's06Public.legal.names.terms' },
  { slug: 'privacy', labelKey: 's06Public.legal.names.privacy' },
  { slug: 'refunds', labelKey: 's06Public.legal.names.refunds' },
  { slug: 'cookies', labelKey: 's06Public.legal.names.cookies' },
  { slug: 'dpa', labelKey: 's06Public.legal.names.dpa' },
  { slug: 'sub-processors', labelKey: 's06Public.legal.names.subProcessors' },
  { slug: 'acceptable-use', labelKey: 's06Public.legal.names.acceptableUse' },
  { slug: 'sla', labelKey: 's06Public.legal.names.sla' },
  { slug: 'gdpr', labelKey: 's06Public.legal.names.gdpr' },
  { slug: 'ccpa', labelKey: 's06Public.legal.names.ccpa' },
  { slug: 'accessibility', labelKey: 's06Public.legal.names.accessibility' },
  { slug: 'responsible-disclosure', labelKey: 's06Public.legal.names.disclosure' },
];
