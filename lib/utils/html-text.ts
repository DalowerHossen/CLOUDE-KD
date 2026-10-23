// path: lib/utils/html-text.ts
// Turning HTML into plain text safely. Removing a pattern once can leave a new one behind (for example "<scr<b>ipt>" becomes
// "<script>"), so each removal is repeated until nothing changes, and entities are decoded in one pass so that "&amp;lt;" becomes
// "&lt;" and never "<". These helpers are for plain text and search only; HTML that is shown must be sanitized, not stripped.

/** Applies a replacement until the text stops changing (at most a few rounds, so it always ends). */
export function replaceUntilStable(
  text: string,
  pattern: RegExp,
  replacement: string | ((match: string, ...groups: string[]) => string),
): string {
  let current = text;
  for (let round = 0; round < 10; round += 1) {
    const next = current.replace(pattern, replacement as string);
    if (next === current) return next;
    current = next;
  }
  return current;
}

/** Removes every tag; a lone "<" or ">" that is left over is removed as well, so no tag can be rebuilt from the pieces. */
export function stripTags(html: string, replacement = ''): string {
  return replaceUntilStable(html, /<[^<>]*>/g, replacement).replace(
    /[<>]/g,
    replacement === '' ? '' : ' ',
  );
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
};

/** Decodes the few entities used in the e-mail and blog text, in one pass (no double decoding). */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:nbsp|lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m] ?? m);
}
