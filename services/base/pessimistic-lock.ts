// path: services/base/pessimistic-lock.ts
// Lease-based locks stored in public.lock_leases. They work across pooled and serverless connections,
// where a session-level advisory lock would be lost between two calls. Expired leases are taken over.
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ConflictError, InternalError } from '@/lib/errors';

export interface LeaseOptions {
  /** Lease length in seconds (1 to 3600). The lease is released earlier when the callback ends. */
  ttlSeconds?: number;
  /** Maximum time to wait for a busy lock, in milliseconds. 0 fails immediately. */
  waitMs?: number;
  companyId?: string | null;
}

const KEY_RE = /^[A-Za-z0-9:_.\-/]{1,300}$/;
const POLL_MS = 50;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function withLease<T>(
  client: SupabaseClient,
  key: string,
  fn: () => Promise<T>,
  options: LeaseOptions = {},
): Promise<T> {
  if (!KEY_RE.test(key)) throw new InternalError();
  const ttl = options.ttlSeconds ?? 30;
  const deadline = Date.now() + (options.waitMs ?? 5_000);
  const owner = randomUUID();
  for (;;) {
    const { data, error } = await client.rpc('kd_acquire_lease', {
      p_key: key,
      p_owner: owner,
      p_ttl_seconds: ttl,
      p_company: options.companyId ?? null,
    });
    if (error) throw new InternalError();
    if (data === true) break;
    if (Date.now() >= deadline) {
      throw new ConflictError('This item is being changed by someone else. Try again in a moment.');
    }
    await sleep(POLL_MS);
  }
  try {
    return await fn();
  } finally {
    await client.rpc('kd_release_lease', { p_key: key, p_owner: owner });
  }
}
