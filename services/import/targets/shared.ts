// path: services/import/targets/shared.ts
// Helpers of the import targets.
import 'server-only';

/** Escapes the characters that act as wildcards in an ILIKE pattern. */
export function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Text safe to place in a PostgREST filter: letters, digits, spaces and a few separators. */
export function filterText(value: string): string {
  return value.replace(/[^\p{L}\p{N} @.\-+]/gu, '').slice(0, 80);
}

export const EXPORT_LIMIT = 10_001;
