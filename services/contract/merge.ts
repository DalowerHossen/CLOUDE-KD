// path: services/contract/merge.ts
// Merge fields: {{client_name}}, {{amount}} and so on are replaced by the values of the contract. Values are escaped, so a
// client name with angle brackets cannot add markup. A field that is not on the list, or has no value, stops the send.
export const MERGE_FIELDS = [
  'client_name',
  'company_name',
  'contract_number',
  'amount',
  'date',
  'start_date',
  'end_date',
  'terms',
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type MergeValues = Partial<Record<MergeField, string>>;

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Placeholder names found in the text, in order, without repeats. */
export function placeholdersIn(html: string): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(PLACEHOLDER)) {
    const name = m[1] ?? '';
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

export function unknownFields(html: string): string[] {
  return placeholdersIn(html).filter((name) => !(MERGE_FIELDS as readonly string[]).includes(name));
}

export interface MergeResult {
  html: string;
  /** Known fields that had no value. */
  missing: string[];
  /** Names that are not merge fields. */
  unknown: string[];
}

export function mergeFields(html: string, values: MergeValues): MergeResult {
  const missing: string[] = [];
  const unknown: string[] = [];
  const out = html.replace(PLACEHOLDER, (whole, raw: string) => {
    if (!(MERGE_FIELDS as readonly string[]).includes(raw)) {
      if (!unknown.includes(raw)) unknown.push(raw);
      return whole;
    }
    const value = values[raw as MergeField];
    if (value === undefined || value.trim() === '') {
      if (!missing.includes(raw)) missing.push(raw);
      return whole;
    }
    return escapeHtml(value);
  });
  return { html: out, missing, unknown };
}
