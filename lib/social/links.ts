// path: lib/social/links.ts
// Link tracking as pure functions: find the https addresses of a post text and swap them for short tracked addresses. The tracked
// address is only used in the text sent to the network; the saved post keeps the original address.
import { SOCIAL_LINK_CODE_LENGTH, SOCIAL_LINK_PATH } from '@/config/s16-social';

const URL_IN_TEXT = /https:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?)\]]+$/;
export const LINK_CODE = new RegExp(`^[0-9A-Za-z]{${SOCIAL_LINK_CODE_LENGTH}}$`);

/** The https addresses in a text, once each, in order (trailing punctuation is not part of an address). */
export function urlsIn(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_IN_TEXT)) seen.add(m[0].replace(TRAILING, ''));
  return [...seen].filter((u) => u.length <= 2000);
}

/** The text with each address in the map replaced by its tracked address. */
export function replaceUrls(text: string, map: ReadonlyMap<string, string>): string {
  return text.replace(URL_IN_TEXT, (found) => {
    const clean = found.replace(TRAILING, '');
    const tail = found.slice(clean.length);
    return `${map.get(clean) ?? clean}${tail}`;
  });
}

export const trackedUrl = (origin: string, code: string): string =>
  `${origin}${SOCIAL_LINK_PATH}/${code}`;

/** Is this address already one of our tracked addresses (so it is not wrapped twice)? */
export const isTracked = (url: string, origin: string): boolean =>
  url.startsWith(`${origin}${SOCIAL_LINK_PATH}/`);

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** A code from random bytes (62 symbols; the bytes above 247 are dropped so every symbol is equally likely). */
export function codeFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b < 248 && out.length < SOCIAL_LINK_CODE_LENGTH) out += ALPHABET[b % 62];
  }
  return out;
}
