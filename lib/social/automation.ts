// path: lib/social/automation.ts
// Auto-post rules as pure functions: a text template with {title}, {url}, {summary} and {image} that is filled from the event that
// fired the rule. Only these four names are allowed, so a mistyped name is found when the rule is saved, not when it fires.
export const TEMPLATE_TOKENS = ['title', 'url', 'summary', 'image'] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

const TOKEN = /\{([a-z][a-z0-9_]*)\}/g;

/** The names used in a template that are not allowed (empty when the template is fine). */
export function unknownTokens(template: string): string[] {
  const found = [...template.matchAll(TOKEN)].map((m) => m[1] ?? '');
  return [...new Set(found.filter((n) => !(TEMPLATE_TOKENS as readonly string[]).includes(n)))];
}

export interface TemplateValues {
  title: string;
  url: string | null;
  summary: string;
  image: string | null;
}

/** Fills the template. A missing value becomes empty text; spaces left behind are tidied. */
export function renderTemplate(template: string, values: TemplateValues): string {
  const filled = template.replace(TOKEN, (whole, name: string) => {
    switch (name) {
      case 'title':
        return values.title;
      case 'url':
        return values.url ?? '';
      case 'summary':
        return values.summary;
      case 'image':
        return values.image ?? '';
      default:
        return whole;
    }
  });
  return filled
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
