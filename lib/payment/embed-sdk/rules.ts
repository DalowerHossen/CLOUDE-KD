// path: lib/payment/embed-sdk/rules.ts
// Rules shared by the embed page, the embed API and the merchant dashboard: which origins may frame the checkout, which
// style options are accepted, and the messages the checkout frame sends to the merchant page. Safe to import in the browser.
import { z } from 'zod';

export const EMBED_MESSAGE_SOURCE = 'kd-checkout';
export const EMBED_MAX_ORIGINS = 20;

/**
 * An origin the merchant may list: https, or http only for a local test server. No path, query, user name or wildcard.
 * Returns the normalised origin or null.
 */
export function normalizeOrigin(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null;
  if (url.hostname.includes('*') || !/^[a-z0-9.-]+$/.test(url.hostname)) return null;
  return url.origin;
}

export const originInput = z
  .object({ origin: z.string().trim().min(8).max(200) })
  .strict()
  .transform((v, ctx) => {
    const origin = normalizeOrigin(v.origin);
    if (!origin) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Enter a web site address such as https://shop.example.com (no path, no wildcard).',
      });
      return z.NEVER;
    }
    return { origin };
  });

/** Style options the merchant page may pass. Values go into CSS custom properties, so each one is strictly limited. */
export const embedStyleSchema = z
  .object({
    primary: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    radius: z.coerce.number().int().min(0).max(32).optional(),
    font: z
      .string()
      .regex(/^[A-Za-z0-9 ,-]{1,80}$/)
      .optional(),
  })
  .strict();
export type EmbedStyle = z.infer<typeof embedStyleSchema>;

/** Query of the embed page: the merchant page origin plus the style options. */
export const embedPageQuery = embedStyleSchema.extend({ origin: z.string().max(200) }).strict();

export const embedPageParams = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/) })
  .strict();

/** What the embed API tells the merchant page. Nothing secret, nothing about the payer. */
export interface EmbedConfig {
  available: true;
  linkExpiresAt: string;
}

/** Messages from the checkout frame to the merchant page. The merchant page checks the sender and the shape again. */
export const embedMessage = z.discriminatedUnion('type', [
  z.object({ source: z.literal(EMBED_MESSAGE_SOURCE), type: z.literal('ready') }).strict(),
  z
    .object({
      source: z.literal(EMBED_MESSAGE_SOURCE),
      type: z.literal('resize'),
      height: z.number().int().min(120).max(4000),
    })
    .strict(),
  z
    .object({
      source: z.literal(EMBED_MESSAGE_SOURCE),
      type: z.literal('complete'),
      paymentId: z.string().uuid(),
      status: z.string().min(1).max(40),
    })
    .strict(),
  z
    .object({
      source: z.literal(EMBED_MESSAGE_SOURCE),
      type: z.literal('redirect'),
      url: z.string().url().max(2000).startsWith('https://'),
    })
    .strict(),
]);
export type EmbedMessage = z.infer<typeof embedMessage>;

/** Rounds a small positive number to the nearest whole number. */
const rnd = (x: number): number => (x + 0.5) | 0;

/** "#rrggbb" as the "H S% L%" triple the style tokens use, plus a readable text colour (white or near black) for it. */
export function hexToHslTokens(hex: string): { primary: string; foreground: string } {
  const n = +`0x${hex.slice(1)}`;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = rnd(h * 60);
    if (h < 0) h += 360;
  }
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return {
    primary: `${h} ${rnd(s * 100)}% ${rnd(l * 100)}%`,
    foreground: luminance > 0.55 ? '222 47% 11%' : '0 0% 100%',
  };
}
