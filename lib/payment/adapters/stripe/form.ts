// path: lib/payment/adapters/stripe/form.ts
// Stripe request bodies are application/x-www-form-urlencoded with bracket notation for nested values.
export type FormValue =
  string | number | boolean | null | undefined | FormObject | readonly FormValue[];
export interface FormObject {
  [key: string]: FormValue;
}

function walk(prefix: string, value: FormValue, out: [string, string][]): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(`${prefix}[${index}]`, item, out));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as FormObject))
      walk(`${prefix}[${key}]`, inner, out);
    return;
  }
  out.push([prefix, String(value)]);
}

export function encodeForm(params: FormObject): string {
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) walk(key, value, pairs);
  return pairs
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k).replace(/%5B/g, '[').replace(/%5D/g, ']')}=${encodeURIComponent(v)}`,
    )
    .join('&');
}
