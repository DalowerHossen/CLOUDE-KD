// path: lib/email/template-body.ts
// Editable template bodies: {{variable}} placeholders, a strict HTML allow list, and the page shell around the body.
import DOMPurify from 'isomorphic-dompurify';

const VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,40})\s*\}\}/g;

export function extractVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((m) => m[1] ?? ''))].filter(Boolean);
}

export function unknownVariables(text: string, allowed: readonly string[]): string[] {
  return extractVariables(text).filter((v) => !allowed.includes(v));
}

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const asText = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';

/** Fills placeholders. Values are HTML-escaped for bodies; for subjects line breaks are removed instead. */
export function fillVariables(
  text: string,
  data: Record<string, unknown>,
  mode: 'html' | 'text',
): string {
  return text.replace(VARIABLE, (_m, name: string) => {
    const value = asText(data[name]);
    return mode === 'html' ? escapeHtml(value) : value.replace(/[\r\n]+/g, ' ');
  });
}

const ALLOWED_TAGS = [
  'p',
  'br',
  'a',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'div',
  'span',
  'img',
  'hr',
  'blockquote',
];
const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'width',
  'height',
  'style',
  'align',
  'colspan',
  'rowspan',
  'target',
  'rel',
];

/** Placeholders may stand in an address; the final HTML is cleaned again after they were filled. */
const URI = /^(?:(?:https?|mailto|tel):|\{\{)/i;

function cleanStyle(html: string): string {
  // Styles keep layout (colors, spacing) but lose anything that loads or runs something.
  return html.replace(/\sstyle="([^"]*)"/gi, (_m, css: string) => {
    const safe = css
      .split(';')
      .filter(
        (d) =>
          d.trim() !== '' &&
          !/url\s*\(|expression|behavior|@import|javascript:|-moz-binding/i.test(d),
      )
      .join(';');
    return safe ? ` style="${safe}"` : '';
  });
}

export function sanitizeBodyHtml(
  html: string,
  options: { allowPlaceholderUri?: boolean } = {},
): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP:
      options.allowPlaceholderUri === false ? /^(?:(?:https?|mailto|tel):)/i : URI,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });
  return cleanStyle(clean).replace(/<a\b(?![^>]*\brel=)/gi, '<a rel="noopener noreferrer"');
}

export interface BrandVariables {
  productName: string;
  primaryColor: string;
  logoUrl: string | null;
  footerText: string;
}

export const DEFAULT_BRAND: BrandVariables = {
  productName: 'KD SOLUTION IT',
  primaryColor: '#1d4ed8',
  logoUrl: null,
  footerText: '',
};

const COLOR = /^#[0-9a-f]{6}$/i;

/** Page shell for edited templates: the same look as the built-in layout, with the brand's name, color and logo. */
export function wrapInShell(brand: BrandVariables, bodyHtml: string, preheader = ''): string {
  const color = COLOR.test(brand.primaryColor) ? brand.primaryColor : DEFAULT_BRAND.primaryColor;
  const logo =
    brand.logoUrl && /^https:\/\//i.test(brand.logoUrl)
      ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.productName)}" height="32" style="display:block;border:0;margin:0 0 16px" />`
      : '';
  const footer = brand.footerText
    ? `<p style="color:#5b6573;font-size:12px;margin:16px 0 0">${escapeHtml(brand.footerText)}</p>`
    : '';
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(brand.productName)}</title></head><body style="margin:0;padding:24px 0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif">${hidden}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;border-top:4px solid ${color}"><tr><td style="padding:32px;font-size:15px;line-height:22px;color:#111827">${logo}<p style="font-size:18px;font-weight:700;margin:0 0 16px;color:${color}">${escapeHtml(brand.productName)}</p>${bodyHtml}${footer}</td></tr></table></td></tr></table></body></html>`;
}

/** Sample values for a preview: each variable shows its own name in square brackets. */
export function sampleData(variables: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    variables.map((v) => [v, /url|link/i.test(v) ? 'https://app.example.com/open' : `[${v}]`]),
  );
}
