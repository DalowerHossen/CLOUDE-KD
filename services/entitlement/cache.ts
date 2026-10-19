// path: services/entitlement/cache.ts
// A short memory of plan answers, so a page that asks ten questions reads the database once. A plan change clears it in
// the same process; other processes see the change within the time below.
const TTL_MS = 15_000;

interface Entry<T> {
  at: number;
  value: T;
}

const stores = new Map<string, Map<string, Entry<unknown>>>();

function store(name: string): Map<string, Entry<unknown>> {
  let s = stores.get(name);
  if (!s) {
    s = new Map();
    stores.set(name, s);
  }
  return s;
}

export async function cached<T>(name: string, key: string, load: () => Promise<T>): Promise<T> {
  const s = store(name);
  const hit = s.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await load();
  s.set(key, { at: Date.now(), value });
  return value;
}

export function invalidatePlanCache(): void {
  stores.clear();
}
