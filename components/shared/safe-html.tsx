// path: components/shared/safe-html.tsx
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
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
];
const ALLOWED_ATTR = [
  'href',
  'title',
  'alt',
  'src',
  'width',
  'height',
  'colspan',
  'rowspan',
  'rel',
  'target',
  'class',
];

/** Removes scripts, event handlers and unsafe URL schemes. Use for every HTML string that reaches the page. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'form', 'svg', 'math'],
    FORBID_ATTR: ['style'],
  });
}

/** The only component allowed to use dangerouslySetInnerHTML; content is sanitized first. */
export function SafeHtml({ html, className }: { html: string; className?: string }): JSX.Element {
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
