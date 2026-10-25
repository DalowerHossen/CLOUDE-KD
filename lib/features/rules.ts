// path: lib/features/rules.ts
// How the flags of the optional modules are read. A company flag beats the global flag; no flag means off. A rollout
// below 100 lets a company in only when its stable bucket (0 to 99) is below the percentage.

export interface FlagRow {
  key: string;
  companyId: string | null;
  enabled: boolean;
  rolloutPercent: number;
}

/** A stable number from 0 to 99 for a company and a flag key (FNV-1a), so a rollout does not flip between requests. */
export function bucketOf(companyId: string, key: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${companyId}:${key}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

function counts(row: FlagRow, companyId: string): boolean {
  return (
    row.enabled && (row.rolloutPercent >= 100 || bucketOf(companyId, row.key) < row.rolloutPercent)
  );
}

/** The keys that are on for the company, out of the keys asked for. */
export function enabledKeys(
  rows: readonly FlagRow[],
  companyId: string,
  keys: readonly string[],
): Set<string> {
  const on = new Set<string>();
  for (const key of keys) {
    const own = rows.find((r) => r.key === key && r.companyId === companyId);
    const global = rows.find((r) => r.key === key && r.companyId === null);
    const decided = own ?? global;
    if (decided && counts(decided, companyId)) on.add(key);
  }
  return on;
}
