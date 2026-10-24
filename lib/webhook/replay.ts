// path: lib/webhook/replay.ts
// Replay and duplicate protection for inbound webhooks.
// The in-memory cache stops fast repeats on one instance. The durable guarantee comes from the
// unique key on webhook_events (STEP 10) and the database idempotency functions (kd_idempotency_*).
export interface ReplayCache {
  /** Returns true the first time a key is seen inside its window, false for a repeat. */
  firstSeen(key: string, now?: number): boolean;
  size(): number;
}

export function createReplayCache(ttlMs = 10 * 60_000, maxEntries = 10_000): ReplayCache {
  const seen = new Map<string, number>();
  const sweep = (now: number): void => {
    for (const [key, at] of seen) {
      if (now - at > ttlMs) seen.delete(key);
      else break; // entries are inserted in time order
    }
    while (seen.size > maxEntries) {
      const oldest = seen.keys().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
  };
  return {
    firstSeen(key, now = Date.now()) {
      sweep(now);
      const at = seen.get(key);
      if (at !== undefined && now - at <= ttlMs) return false;
      seen.delete(key);
      seen.set(key, now);
      sweep(now);
      return true;
    },
    size: () => seen.size,
  };
}
