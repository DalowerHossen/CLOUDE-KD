// path: lib/seo/settings.ts
// Shape of the site-wide search settings. Safe to import in the browser.
import { z } from 'zod';

const token = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{10,120}$/)
  .or(z.literal(''));
const profile = z.string().trim().url().startsWith('https://').max(200).or(z.literal(''));

export const seoSettingsSchema = z
  .object({
    verification: z
      .object({ google: token, bing: token, yandex: token, pinterest: token, facebook: token })
      .strict(),
    social: z
      .object({
        x: profile,
        linkedin: profile,
        facebook: profile,
        youtube: profile,
        github: profile,
      })
      .strict(),
    organization: z
      .object({
        legalName: z.string().trim().max(120),
        contactEmail: z.string().trim().email().max(200).or(z.literal('')),
      })
      .strict(),
  })
  .strict();
export type SeoSettings = z.infer<typeof seoSettingsSchema>;

export const EMPTY_SEO_SETTINGS: SeoSettings = {
  verification: { google: '', bing: '', yandex: '', pinterest: '', facebook: '' },
  social: { x: '', linkedin: '', facebook: '', youtube: '', github: '' },
  organization: { legalName: '', contactEmail: '' },
};
