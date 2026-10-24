// path: services/storage/quota.ts
// Storage quota per company and month, from the plan entitlements (or the defaults in config/storage.ts).
import 'server-only';
import { z } from 'zod';
import { DEFAULT_MONTHLY_UPLOAD_BYTES, DEFAULT_STORAGE_QUOTA_BYTES } from '@/config/storage';
import { tryGetService } from '@/lib/container';
import { AppError, InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

const MB = 1024 * 1024;

async function planLimit(companyId: string, key: string, fallback: number): Promise<number> {
  const entitlement = tryGetService('entitlement');
  if (!entitlement) return fallback;
  try {
    const value = await entitlement.limit(companyId, key);
    return typeof value === 'number' ? value * MB : fallback;
  } catch {
    return fallback;
  }
}

export async function storageUsed(companyId: string): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_company_storage_bytes', {
    p_company: companyId,
  });
  if (error) throw new InternalError(error);
  return z.coerce.number().parse(data ?? 0);
}

export interface QuotaState {
  usedBytes: number;
  quotaBytes: number;
  monthlyLimitBytes: number;
}

export async function quotaState(companyId: string): Promise<QuotaState> {
  const [usedBytes, quotaBytes, monthlyLimitBytes] = await Promise.all([
    storageUsed(companyId),
    planLimit(companyId, 'storage.quota_mb', DEFAULT_STORAGE_QUOTA_BYTES),
    planLimit(companyId, 'storage.monthly_upload_mb', DEFAULT_MONTHLY_UPLOAD_BYTES),
  ]);
  return { usedBytes, quotaBytes, monthlyLimitBytes };
}

const quotaError = (message: string): AppError => new AppError('conflict', 409, message);

/** Refuses a file that would pass the total quota. Cheap check before any work is done. */
export async function assertWithinQuota(companyId: string, incomingBytes: number): Promise<void> {
  const state = await quotaState(companyId);
  if (state.usedBytes + incomingBytes > state.quotaBytes) {
    throw quotaError('The storage quota of this plan is full. Delete files or upgrade the plan.');
  }
}

/** Adds the bytes to the month; refuses when the monthly upload limit would be passed. */
export async function recordMonthlyUsage(companyId: string, bytes: number): Promise<void> {
  const limit = await planLimit(
    companyId,
    'storage.monthly_upload_mb',
    DEFAULT_MONTHLY_UPLOAD_BYTES,
  );
  const { data, error } = await getAdminSupabase().rpc('kd_upload_usage_add', {
    p_company: companyId,
    p_bytes: bytes,
    p_monthly_limit: limit,
  });
  if (error) throw new InternalError(error);
  if (z.object({ allowed: z.boolean() }).parse(data).allowed !== true) {
    throw quotaError('The monthly upload limit of this plan is reached.');
  }
}
