// path: lib/cms/sanitize-blocks.ts
// Cleans rich text inside blocks before they are stored. Every other field is plain text (React escapes it on show).
import { sanitizeHtml } from '@/lib/security/rich-text';
import type { Block } from './blocks';

export function sanitizeBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.type === 'richtext' ? { ...b, html: sanitizeHtml(b.html) } : b));
}
