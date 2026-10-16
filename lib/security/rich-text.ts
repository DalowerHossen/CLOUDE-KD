// path: lib/security/rich-text.ts
// Server-side HTML sanitizing with DOMPurify (rich text fields, notes, e-mail previews). The tag list matches
// components/shared/safe-html.tsx so the client and the server agree.
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'a',
  'b',
  'i',
  'em',
  'strong',
  'u',
  's',
  'p',
  'br',
  'hr',
  'blockquote',
  'code',
  'pre',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'colspan', 'rowspan'];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcdoc', 'formaction'],
    ADD_ATTR: ['target'],
    RETURN_TRUSTED_TYPE: false,
  });
}

/** Plain text version: every tag removed. */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
