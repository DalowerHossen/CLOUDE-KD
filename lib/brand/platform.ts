// path: lib/brand/platform.ts
// Shape of the platform brand shown on the public site (name, tagline, logo and footer line). Safe to import in the browser.
import { z } from 'zod';

const plain = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^<>]*$/, 'Angle brackets are not allowed.');

export const platformBrandSchema = z
  .object({
    name: plain(60).min(1),
    tagline: plain(200),
    /** A file of the media library (category cms); empty keeps the built-in mark. */
    logoMediaId: z
      .string()
      .regex(/^[0-9a-f-]{36}$/)
      .or(z.literal('')),
    footerNote: plain(300),
  })
  .strict();
export type PlatformBrand = z.infer<typeof platformBrandSchema>;

export const DEFAULT_PLATFORM_BRAND: PlatformBrand = {
  name: 'KD SOLUTION IT',
  tagline: 'Invoicing, payments, payroll and accounting for growing businesses.',
  logoMediaId: '',
  footerNote: '',
};

export function logoUrl(brand: PlatformBrand): string | null {
  return brand.logoMediaId === '' ? null : `/api/cms/media/${brand.logoMediaId}`;
}
