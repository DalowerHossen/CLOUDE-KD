// path: lib/transfer/rows.ts
// Table-driven reading of one spreadsheet row into the input of a list. Pure.
import type { ZodTypeAny, z } from 'zod';
import { Money } from '@/lib/utils/currency';
import type { TransferField } from './mapping';

export type Draft = Record<string, unknown>;
export type Read = (text: string) => { path: string[]; value: unknown } | string;
export interface FieldDef extends TransferField {
  read: Read;
}

const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);

export const reads = {
  text:
    (...path: string[]): Read =>
    (v) => ({ path, value: v }),
  lower:
    (...path: string[]): Read =>
    (v) => ({ path, value: v.toLowerCase() }),
  country:
    (...path: string[]): Read =>
    (v) =>
      /^[A-Za-z]{2}$/.test(v)
        ? { path, value: v.toUpperCase() }
        : 'Use a two-letter country code such as US.',
  integer:
    (min: number, max: number, ...path: string[]): Read =>
    (v) =>
      /^\d{1,6}$/.test(v) && Number(v) >= min && Number(v) <= max
        ? { path, value: Number(v) }
        : `Use a whole number from ${min} to ${max}.`,
  oneOf:
    (list: readonly string[], ...path: string[]): Read =>
    (v) =>
      list.includes(v.toLowerCase())
        ? { path, value: v.toLowerCase() }
        : `Use one of: ${list.join(', ')}.`,
  list:
    (...path: string[]): Read =>
    (v) => ({
      path,
      value: v
        .split(';')
        .map((x) => x.trim())
        .filter((x) => x !== ''),
    }),
  money:
    (...path: string[]): Read =>
    (v) => {
      try {
        Money.parse(v);
        return { path, value: v };
      } catch {
        return 'Use an amount with at most four decimal places, for example 12.50.';
      }
    },
  bool:
    (...path: string[]): Read =>
    (v) =>
      YES.has(v.toLowerCase())
        ? { path, value: true }
        : NO.has(v.toLowerCase())
          ? { path, value: false }
          : 'Use yes or no.',
};

function setPath(target: Draft, path: readonly string[], value: unknown): void {
  let node = target;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (typeof next === 'object' && next !== null && !Array.isArray(next)) node = next as Draft;
    else {
      const created: Draft = {};
      node[key] = created;
      node = created;
    }
  }
  const last = path[path.length - 1];
  if (last !== undefined) node[last] = value;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function deepMerge<T extends Draft>(base: T, patch: Draft): T {
  const out: Draft = clone(base);
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] =
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v) &&
      typeof cur === 'object' &&
      cur !== null
        ? deepMerge(cur as Draft, v as Draft)
        : v;
  }
  return out as T;
}

export interface Parsed<I> {
  input: I;
  /** Only the fields the row gave a value for; an overwrite changes just these. */
  patch: Draft;
}

export function parseRow<S extends ZodTypeAny>(
  defs: readonly FieldDef[],
  defaults: Draft,
  schema: S,
  row: Record<string, string>,
  after?: (draft: Draft) => void,
): { ok: true; value: Parsed<z.output<S>> } | { ok: false; errors: string[] } {
  const full: Draft = clone(defaults);
  const patch: Draft = {};
  const errors: string[] = [];
  for (const def of defs) {
    const text = (row[def.key] ?? '').trim();
    if (text === '') continue;
    const r = def.read(text);
    if (typeof r === 'string') errors.push(`${def.label}: ${r}`);
    else {
      setPath(full, r.path, r.value);
      setPath(patch, r.path, r.value);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  after?.(full);
  const checked = schema.safeParse(full);
  if (!checked.success)
    return {
      ok: false,
      errors: checked.error.issues.map((i) => {
        const key = i.path.join('.');
        const snake = key.replace(/\./g, '_').replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        const def = defs.find((d) => d.key === snake);
        return `${def?.label ?? key}: ${i.message}`;
      }),
    };
  return { ok: true, value: { input: checked.data as z.output<S>, patch } };
}
