// path: components/admin/shared/conflict.ts
import { z } from 'zod';
import type { FieldDifference } from './conflict-dialog';

const conflictBody = z.object({ error: z.object({ code: z.literal('conflict') }) });

/** True when the response is the standard version-conflict error (HTTP 409 with code "conflict"). */
export async function isVersionConflict(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  return conflictBody.safeParse(
    await response
      .clone()
      .json()
      .catch(() => null),
  ).success;
}

/** Fields whose text differs between the user's draft and the saved record. */
export function diffFields(
  mine: Readonly<Record<string, string>>,
  saved: Readonly<Record<string, string>>,
): FieldDifference[] {
  return Object.keys(mine)
    .filter((field) => (saved[field] ?? '') !== (mine[field] ?? ''))
    .map((field) => ({ field, yours: mine[field] ?? '', theirs: saved[field] ?? '' }));
}
