// path: lib/blog/text.ts
// Small text helpers of the blog: address slugs, plain text of a body and the reading time.

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** The text of already sanitized HTML, used for search and for the reading time. */
export function plainText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|tr)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reading time in whole minutes at 200 words a minute, at least one. */
export function readMinutes(text: string): number {
  const words = text === '' ? 0 : text.split(' ').length;
  return Math.min(120, Math.max(1, Math.ceil(words / 200)));
}
