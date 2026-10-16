// path: lib/crm/custom-values.ts
// Custom field definitions and the check of values against them. Pure, safe to import anywhere.
import { ValidationError } from '@/lib/errors';
import type { CustomFieldDefInput } from './clients';

export type CustomEntity = 'client' | 'product' | 'supplier';
export interface CustomFieldDef extends CustomFieldDefInput {
  id: string;
  version: number;
}

type Value = string | number | boolean | null;

/** Checks values against the definitions and returns the values to store. Unknown keys are refused. */
export function checkCustomValues(
  defs: readonly CustomFieldDef[],
  values: Record<string, Value>,
): Record<string, Value> {
  const issues: { path: string; message: string }[] = [];
  const out: Record<string, Value> = {};
  const known = new Map(defs.map((d) => [d.key, d]));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) issues.push({ path: `customFields.${key}`, message: 'Unknown field.' });
  }
  for (const d of defs) {
    const v = values[d.key] ?? null;
    const empty = v === null || v === '';
    if (empty) {
      if (d.required)
        issues.push({ path: `customFields.${d.key}`, message: `${d.label} is required.` });
      out[d.key] = null;
      continue;
    }
    if (d.kind === 'text' && typeof v !== 'string')
      issues.push({ path: `customFields.${d.key}`, message: 'Enter text.' });
    else if (d.kind === 'number' && (typeof v !== 'number' || !Number.isFinite(v)))
      issues.push({ path: `customFields.${d.key}`, message: 'Enter a number.' });
    else if (d.kind === 'bool' && typeof v !== 'boolean')
      issues.push({ path: `customFields.${d.key}`, message: 'Choose yes or no.' });
    else if (
      d.kind === 'date' &&
      (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
    )
      issues.push({ path: `customFields.${d.key}`, message: 'Enter a date.' });
    else if (d.kind === 'select' && (typeof v !== 'string' || !d.options.includes(v)))
      issues.push({ path: `customFields.${d.key}`, message: 'Choose one of the options.' });
    out[d.key] = v;
  }
  if (issues.length > 0) throw new ValidationError('Some custom fields are not valid.', issues);
  return out;
}
