// path: lib/i18n/index.ts
import { en } from './strings/en';

type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
    }[keyof T & string];

/** Typed dotted path to a string, for example "s01Core.common.save". */
export type StringKey = Leaves<typeof en>;

/** Looks up an English string and fills {name} placeholders. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') return key;
  if (!params) return node;
  return node.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export { en };
