// path: lib/analytics/consent.ts
// The visitor's cookie choice. Stored in a cookie the browser can read (no tracking script may start before it says
// yes) and recorded on the server through the consent contract as evidence. Pure functions; no browser access here.
export const CONSENT_COOKIE = 'kd_consent';
export const VISITOR_COOKIE = 'kd_visitor';
/** Change this when the cookie text changes: every visitor is asked again. */
export const COOKIE_POLICY_VERSION = '2026-01';
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 3600;
export const OPEN_CONSENT_EVENT = 'kd:open-consent';

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
}

/** "v1.a1.m0" - version, analytics, marketing. Anything else counts as "not decided". */
export function serializeConsent(choice: ConsentChoice): string {
  return `v${COOKIE_POLICY_VERSION}.a${choice.analytics ? 1 : 0}.m${choice.marketing ? 1 : 0}`;
}

export function parseConsent(raw: string | null | undefined): ConsentChoice | null {
  if (!raw) return null;
  const m = /^v([0-9-]{7})\.a([01])\.m([01])$/.exec(raw.trim());
  if (!m || m[1] !== COOKIE_POLICY_VERSION) return null;
  return { analytics: m[2] === '1', marketing: m[3] === '1' };
}

/** Reads the choice from a Cookie header or document.cookie string. */
export function consentFromCookieString(cookies: string): ConsentChoice | null {
  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CONSENT_COOKIE) return parseConsent(rest.join('='));
  }
  return null;
}

export const CONSENT_TEXT =
  'I allow cookies for analytics and marketing as chosen in the cookie settings of KD SOLUTION IT. Necessary cookies are always used.';
