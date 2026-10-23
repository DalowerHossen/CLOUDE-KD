// path: lib/email/content.ts
// Message body helpers: plain-text alternative, link collection, tracking rewrite, link allow list and a simple
// phishing and spam pre-check. Pure functions; no network access.
import { createHmac, randomBytes } from 'node:crypto';
import { decodeEntities, replaceUntilStable, stripTags } from '@/lib/utils/html-text';

const HREF = /<a\b([^>]*?)\shref\s*=\s*("([^"]*)"|'([^']*)')([^>]*)>/gi;

export function newTrackingToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Readable text from HTML: links keep their address in brackets, blocks become lines. */
export function htmlToText(html: string): string {
  const blocks = replaceUntilStable(html, /<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => {
        const text = stripTags(label).trim();
        return /^https?:/i.test(href) && text !== href ? `${text} (${href})` : text || href;
      },
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ');
  // Tags go first and entities are decoded last, so a decoded "<" is text and is never taken for a tag.
  return decodeEntities(stripTags(blocks))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function collectLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(HREF)) {
    const href = decodeEntities(m[3] ?? m[4] ?? '');
    if (/^https?:\/\//i.test(href)) out.push(href);
  }
  return out;
}

/**
 * Sends link clicks through our own address (click tracking) and adds the open pixel. The real address is kept in the
 * outbox row, so the click address only carries a token and an index: it cannot be used as an open redirect.
 * Returns the changed HTML and the list of original links.
 */
export function addTracking(
  html: string,
  token: string,
  baseUrl: string,
): { html: string; links: string[] } {
  const base = baseUrl.replace(/\/+$/, '');
  const links: string[] = [];
  const rewritten = html.replace(
    HREF,
    (
      whole,
      before: string,
      _q: string,
      dq: string | undefined,
      sq: string | undefined,
      after: string,
    ) => {
      const href = decodeEntities(dq ?? sq ?? '');
      if (!/^https?:\/\//i.test(href)) return whole;
      links.push(href);
      return `<a${before} href="${base}/api/email/track/click/${token}/${links.length - 1}"${after}>`;
    },
  );
  const pixel = `<img src="${base}/api/email/track/open/${token}" width="1" height="1" alt="" style="display:none;border:0" />`;
  const body = /<\/body>/i.test(rewritten)
    ? rewritten.replace(/<\/body>/i, `${pixel}</body>`)
    : `${rewritten}${pixel}`;
  return { html: body, links };
}

/** Hosts a link may point to. Anything else in tenant-edited content is refused (feature 487). */
export function disallowedLinkHosts(html: string, allowed: readonly string[]): string[] {
  const ok = new Set(allowed.map((h) => h.toLowerCase()));
  const bad = new Set<string>();
  for (const link of collectLinks(html)) {
    try {
      const host = new URL(link).hostname.toLowerCase();
      if (![...ok].some((a) => host === a || host.endsWith(`.${a}`))) bad.add(host);
    } catch {
      bad.add(link.slice(0, 60));
    }
  }
  return [...bad];
}

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
]);
const SPAM_PHRASES = [
  /act now/i,
  /100% free/i,
  /click here immediately/i,
  /wire transfer/i,
  /verify your account now/i,
  /you have won/i,
  /urgent action required/i,
];

export interface ContentFinding {
  code:
    | 'link_text_mismatch'
    | 'url_shortener'
    | 'ip_address_link'
    | 'spam_phrase'
    | 'script'
    | 'form'
    | 'too_many_links';
  detail: string;
}

/** Cheap phishing and spam signals for content that a tenant can edit. A finding is a reason to review, not proof. */
export function scanContent(html: string): ContentFinding[] {
  const findings: ContentFinding[] = [];
  if (/<script\b/i.test(html))
    findings.push({ code: 'script', detail: 'Scripts are not allowed in e-mail.' });
  if (/<form\b/i.test(html))
    findings.push({ code: 'form', detail: 'Forms in e-mail are used for phishing.' });
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1] ?? '';
    const label = stripTags(m[2] ?? '').trim();
    let host = '';
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (SHORTENERS.has(host)) findings.push({ code: 'url_shortener', detail: host });
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host))
      findings.push({ code: 'ip_address_link', detail: host });
    const shown = /^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(?:\/|$)/i
      .exec(label)?.[1]
      ?.toLowerCase();
    if (shown && shown !== host && !host.endsWith(`.${shown}`) && !shown.endsWith(`.${host}`)) {
      findings.push({ code: 'link_text_mismatch', detail: `${shown} -> ${host}` });
    }
  }
  const text = htmlToText(html);
  for (const re of SPAM_PHRASES)
    if (re.test(text)) findings.push({ code: 'spam_phrase', detail: re.source });
  if (collectLinks(html).length > 25)
    findings.push({ code: 'too_many_links', detail: 'More than 25 links.' });
  return findings;
}

/** Signed value for the unsubscribe and list headers. */
export function signToken(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url').slice(0, 22);
}
