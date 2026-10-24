// path: lib/analytics/providers.ts
// The tracking providers the site can load, the consent each needs and the addresses each talks to.
// Safe to import in the browser. Nothing here starts a script.
import { z } from 'zod';

export type ConsentCategory = 'analytics' | 'marketing';

export interface ProviderInfo {
  key: PixelKey;
  label: string;
  category: ConsentCategory;
  /** Shape of the identifier the provider gives out. */
  pattern: RegExp;
  /** Addresses the provider script loads from and sends data to (for the content security policy). */
  origins: readonly string[];
}

export const PIXEL_KEYS = [
  'ga4',
  'gtm',
  'clarity',
  'metaPixel',
  'tiktok',
  'linkedin',
  'x',
  'pinterest',
] as const;
export type PixelKey = (typeof PIXEL_KEYS)[number];

export const PROVIDERS: Readonly<Record<PixelKey, ProviderInfo>> = {
  ga4: {
    key: 'ga4',
    label: 'Google Analytics 4',
    category: 'analytics',
    pattern: /^G-[A-Z0-9]{6,14}$/,
    origins: [
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://region1.google-analytics.com',
    ],
  },
  gtm: {
    key: 'gtm',
    label: 'Google Tag Manager',
    category: 'analytics',
    pattern: /^GTM-[A-Z0-9]{4,10}$/,
    origins: ['https://www.googletagmanager.com'],
  },
  clarity: {
    key: 'clarity',
    label: 'Microsoft Clarity',
    category: 'analytics',
    pattern: /^[a-z0-9]{8,14}$/,
    origins: ['https://www.clarity.ms', 'https://c.clarity.ms'],
  },
  metaPixel: {
    key: 'metaPixel',
    label: 'Meta Pixel',
    category: 'marketing',
    pattern: /^[0-9]{8,20}$/,
    origins: ['https://connect.facebook.net', 'https://www.facebook.com'],
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok Pixel',
    category: 'marketing',
    pattern: /^[A-Z0-9]{8,32}$/,
    origins: ['https://analytics.tiktok.com'],
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn Insight Tag',
    category: 'marketing',
    pattern: /^[0-9]{5,12}$/,
    origins: ['https://snap.licdn.com', 'https://px.ads.linkedin.com'],
  },
  x: {
    key: 'x',
    label: 'X Pixel',
    category: 'marketing',
    pattern: /^[a-z0-9]{4,12}$/,
    origins: ['https://static.ads-twitter.com', 'https://analytics.twitter.com', 'https://t.co'],
  },
  pinterest: {
    key: 'pinterest',
    label: 'Pinterest Tag',
    category: 'marketing',
    pattern: /^[0-9]{10,16}$/,
    origins: ['https://s.pinimg.com', 'https://ct.pinterest.com'],
  },
};

const idField = (key: PixelKey): z.ZodType<string> =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || PROVIDERS[key].pattern.test(v), {
      message: `${PROVIDERS[key].label}: the identifier does not have the expected form.`,
    });

export const pixelSettingsSchema = z
  .object({
    ga4: idField('ga4'),
    gtm: idField('gtm'),
    clarity: idField('clarity'),
    metaPixel: idField('metaPixel'),
    tiktok: idField('tiktok'),
    linkedin: idField('linkedin'),
    x: idField('x'),
    pinterest: idField('pinterest'),
  })
  .strict();
export type PixelSettings = z.infer<typeof pixelSettingsSchema>;

export const EMPTY_PIXELS: PixelSettings = {
  ga4: '',
  gtm: '',
  clarity: '',
  metaPixel: '',
  tiktok: '',
  linkedin: '',
  x: '',
  pinterest: '',
};

/** Providers that may run now: they have an identifier and the visitor allowed their category. */
export function activeProviders(
  settings: PixelSettings,
  consent: { analytics: boolean; marketing: boolean } | null,
): PixelKey[] {
  if (!consent) return [];
  return PIXEL_KEYS.filter((k) => settings[k] !== '' && consent[PROVIDERS[k].category]);
}

/** Addresses the content security policy must allow for the providers a visitor agreed to. */
export function originsFor(keys: readonly PixelKey[]): string[] {
  return [...new Set(keys.flatMap((k) => PROVIDERS[k].origins))];
}

/** Events the public site reports. */
export const SITE_EVENTS = [
  'page_view',
  'signup_click',
  'contact_sent',
  'cta_click',
  'free_tool_used',
] as const;
export type SiteEvent = (typeof SITE_EVENTS)[number];
