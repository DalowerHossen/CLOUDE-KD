// path: services/base/advisory-lock.ts
// Named locks (for example numbering sequences or cron leaders) and row locks, both as leases.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { InternalError } from '@/lib/errors';
import { withLease, type LeaseOptions } from './pessimistic-lock';

const TABLE_RE = /^[a-z][a-z0-9_]{0,62}$/;

export function withAdvisoryLock<T>(
  client: SupabaseClient,
  key: string,
  fn: () => Promise<T>,
  options?: LeaseOptions,
): Promise<T> {
  return withLease(client, `adv:${key}`, fn, options);
}

/** Serializes writers of one row. The row version check still protects readers that never take the lock. */
export function withRowLock<T>(
  client: SupabaseClient,
  table: string,
  id: string,
  fn: () => Promise<T>,
  options?: LeaseOptions,
): Promise<T> {
  if (!TABLE_RE.test(table)) throw new InternalError();
  z.string().uuid().parse(id);
  return withLease(client, `row:${table}:${id}`, fn, options);
}
