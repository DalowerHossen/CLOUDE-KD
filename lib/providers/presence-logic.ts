// path: lib/providers/presence-logic.ts
// Pure presence and edit-lock rules. A lock belongs to the person who has been editing the longest; it expires
// when that person sends no heartbeat for 5 minutes.
export const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
export const HEARTBEAT_MS = 30 * 1000;

export interface PresenceEntry {
  userId: string;
  name: string;
  editing: boolean;
  /** ISO time when this person started editing. */
  editingSince: string | null;
  /** ISO time of the last heartbeat. */
  heartbeatAt: string;
}

export interface LockState {
  holder: PresenceEntry | null;
  /** Milliseconds until the holder's lock expires without a new heartbeat. */
  expiresInMs: number | null;
}

export function isFresh(entry: PresenceEntry, now: number, timeoutMs = LOCK_TIMEOUT_MS): boolean {
  const beat = Date.parse(entry.heartbeatAt);
  return Number.isFinite(beat) && now - beat < timeoutMs;
}

export function computeLock(
  entries: readonly PresenceEntry[],
  now: number,
  timeoutMs = LOCK_TIMEOUT_MS,
): LockState {
  const active = entries
    .filter((e) => e.editing && e.editingSince !== null && isFresh(e, now, timeoutMs))
    .sort(
      (a, b) =>
        Date.parse(a.editingSince ?? '') - Date.parse(b.editingSince ?? '') ||
        a.userId.localeCompare(b.userId),
    );
  const holder = active[0] ?? null;
  if (!holder) return { holder: null, expiresInMs: null };
  return { holder, expiresInMs: Math.max(0, timeoutMs - (now - Date.parse(holder.heartbeatAt))) };
}

/** Topic name for a private presence channel. The server builds the tenant part; the client never chooses it. */
export function presenceTopic(scope: { companyId: string | null }, resource: string): string {
  const safe = resource.replace(/[^a-z0-9:_.-]/gi, '_').slice(0, 120);
  return scope.companyId ? `tenant:${scope.companyId}:${safe}` : `platform:${safe}`;
}
