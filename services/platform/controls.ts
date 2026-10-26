// path: services/platform/controls.ts
// Operations controls of the super admin: the maintenance switch, kill switches for feature flags and per-company request
// caps. Every change is audited. Reads are kept for a few seconds; a read that fails never takes the site down (maintenance
// reads fail open, a kill switch read failing leaves the flags as they are).
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  OFF,
  activeCap,
  isMaintenanceActive,
  maintenanceSchema,
  type KillSwitchInput,
  type MaintenanceInput,
  type TenantLimitInput,
} from '@/lib/platform/controls';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { cached, invalidatePlanCache } from '@/services/entitlement/cache';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'platform-controls' });

function requireSuper(actor: Actor): void {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
}

async function audit(
  action: string,
  resourceId: string | null,
  companyId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'platform_control',
    resourceId,
    companyId,
    metadata,
  });
}

// ---- maintenance ----
export async function getMaintenance(): Promise<MaintenanceInput> {
  try {
    return await cached('maintenance', 'platform', async () => {
      const { data, error } = await getAdminSupabase()
        .from('platform_controls')
        .select('value')
        .eq('key', 'maintenance')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return OFF;
      const parsed = maintenanceSchema.safeParse(data.value);
      return parsed.success ? parsed.data : OFF;
    });
  } catch (error) {
    log.error('maintenance switch could not be read; treating it as off', { error });
    return OFF;
  }
}

export async function maintenanceActive(now: Date = new Date()): Promise<boolean> {
  return isMaintenanceActive(await getMaintenance(), now);
}

export async function setMaintenance(actor: Actor, input: MaintenanceInput): Promise<void> {
  requireSuper(actor);
  const admin = getAdminSupabase();
  const existing = await admin
    .from('platform_controls')
    .select('id')
    .eq('key', 'maintenance')
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const write = existing.data
    ? await admin
        .from('platform_controls')
        .update({ value: input, updated_by: actor.userId })
        .eq('id', String(existing.data.id))
    : await admin
        .from('platform_controls')
        .insert({ key: 'maintenance', value: input, updated_by: actor.userId });
  if (write.error) throw new InternalError(write.error);
  invalidatePlanCache();
  await audit('platform.maintenance_set', null, null, {
    enabled: input.enabled,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    by: actor.userId,
  });
}

// ---- kill switches ----
export interface KillSwitchView {
  id: string;
  flagKey: string;
  reason: string;
  engagedAt: string;
  releasedAt: string | null;
}

export async function listKillSwitches(): Promise<KillSwitchView[]> {
  const { data, error } = await getAdminSupabase()
    .from('kill_switches')
    .select('id, flag_key, reason, created_at, released_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    flagKey: String(r.flag_key),
    reason: String(r.reason),
    engagedAt: String(r.created_at),
    releasedAt: r.released_at ? String(r.released_at) : null,
  }));
}

/** The flag keys that are switched off for everyone. A failed read leaves the flags as they are. */
export async function engagedKillSwitches(): Promise<ReadonlySet<string>> {
  try {
    return await cached('kill', 'platform', async () => {
      const { data, error } = await getAdminSupabase()
        .from('kill_switches')
        .select('flag_key')
        .is('released_at', null)
        .is('deleted_at', null)
        .limit(500);
      if (error) throw error;
      return new Set((data ?? []).map((r) => String(r.flag_key)));
    });
  } catch (error) {
    log.error('kill switches could not be read', { error });
    return new Set<string>();
  }
}

export async function runKillSwitch(actor: Actor, input: KillSwitchInput): Promise<void> {
  requireSuper(actor);
  const admin = getAdminSupabase();
  if (input.action === 'engage') {
    const r = await admin
      .from('kill_switches')
      .insert({ flag_key: input.flagKey, reason: input.reason, engaged_by: actor.userId })
      .select('id')
      .single();
    if (r.error) {
      if (r.error.code === '23505') throw new ConflictError('This switch is already engaged.');
      throw new InternalError(r.error);
    }
    invalidatePlanCache();
    await audit('platform.kill_switch_engaged', String(r.data.id), null, {
      flagKey: input.flagKey,
      reason: input.reason,
      by: actor.userId,
    });
    return;
  }
  const r = await admin
    .from('kill_switches')
    .update({ released_at: new Date().toISOString(), released_by: actor.userId })
    .eq('id', input.id)
    .is('released_at', null)
    .is('deleted_at', null)
    .select('id, flag_key');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  invalidatePlanCache();
  await audit('platform.kill_switch_released', input.id, null, {
    flagKey: String(r.data[0]?.flag_key ?? ''),
    by: actor.userId,
  });
}

// ---- per-company caps ----
export interface TenantLimitView {
  companyId: string;
  companyName: string;
  limitPerMinute: number;
  reason: string;
  expiresAt: string | null;
}

export async function listTenantLimits(): Promise<TenantLimitView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('tenant_rate_limits')
    .select('company_id, limit_per_minute, reason, expires_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  const ids = (data ?? []).map((r) => String(r.company_id));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const c = await admin.from('companies').select('id, name').in('id', ids);
    for (const row of c.data ?? []) names.set(String(row.id), String(row.name));
  }
  return (data ?? []).map((r) => ({
    companyId: String(r.company_id),
    companyName: names.get(String(r.company_id)) ?? '',
    limitPerMinute: Number(r.limit_per_minute),
    reason: String(r.reason),
    expiresAt: r.expires_at ? String(r.expires_at) : null,
  }));
}

/** The request cap per minute for a company, or null. A failed read leaves the company without a cap. */
export async function capFor(companyId: string): Promise<number | null> {
  try {
    return await cached('tenant-cap', companyId, async () => {
      const { data, error } = await getAdminSupabase()
        .from('tenant_rate_limits')
        .select('limit_per_minute, expires_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return activeCap(
        data
          ? {
              limitPerMinute: Number(data.limit_per_minute),
              expiresAt: data.expires_at ? String(data.expires_at) : null,
            }
          : null,
      );
    });
  } catch (error) {
    log.error('tenant cap could not be read', { error });
    return null;
  }
}

export async function runTenantLimit(actor: Actor, input: TenantLimitInput): Promise<void> {
  requireSuper(actor);
  const admin = getAdminSupabase();
  const company = await admin
    .from('companies')
    .select('id')
    .eq('id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!company.data) throw new NotFoundError();
  const existing = await admin
    .from('tenant_rate_limits')
    .select('id')
    .eq('company_id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  if (input.action === 'clear') {
    if (!existing.data) throw new NotFoundError();
    const r = await admin
      .from('tenant_rate_limits')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(existing.data.id));
    if (r.error) throw new InternalError(r.error);
  } else {
    const row = {
      limit_per_minute: input.limitPerMinute,
      reason: input.reason,
      set_by: actor.userId,
      expires_at: input.expiresAt,
    };
    const r = existing.data
      ? await admin.from('tenant_rate_limits').update(row).eq('id', String(existing.data.id))
      : await admin.from('tenant_rate_limits').insert({ ...row, company_id: input.companyId });
    if (r.error) throw new InternalError(r.error);
  }
  invalidatePlanCache();
  await audit('platform.tenant_cap_' + input.action, null, input.companyId, {
    limitPerMinute: input.action === 'set' ? input.limitPerMinute : null,
    by: actor.userId,
  });
}
