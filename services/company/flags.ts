// path: services/company/flags.ts
// Feature flag manager for the super admin: global flags and per-company overrides, with a rollout percentage.
// Every change needs a fresh step-up, uses the version column (optimistic lock) and is written to the audit log.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, InternalError } from '@/lib/errors';
import type { FlagInput } from '@/lib/company/ops-input';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface FlagView {
  key: string;
  companyId: string | null;
  companyName: string;
  enabled: boolean;
  rolloutPercent: number;
  version: number;
  updatedAt: string;
}

export async function listFlags(): Promise<FlagView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('feature_flags')
    .select('key, company_id, enabled, rollout_percent, version, updated_at')
    .is('deleted_at', null)
    .order('key')
    .limit(500);
  if (error) throw new InternalError(error);
  const ids = [
    ...new Set((data ?? []).flatMap((r) => (r.company_id ? [String(r.company_id)] : []))),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const c = await admin.from('companies').select('id, name').in('id', ids);
    for (const row of c.data ?? []) names.set(String(row.id), String(row.name));
  }
  return (data ?? []).map((r) => ({
    key: String(r.key),
    companyId: r.company_id ? String(r.company_id) : null,
    companyName: r.company_id ? (names.get(String(r.company_id)) ?? '') : '',
    enabled: r.enabled === true,
    rolloutPercent: Number(r.rollout_percent),
    version: Number(r.version),
    updatedAt: String(r.updated_at),
  }));
}

export async function saveFlag(actor: Actor, input: FlagInput): Promise<{ version: number }> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const admin = getAdminSupabase();
  let existing = admin
    .from('feature_flags')
    .select('id, version')
    .eq('key', input.key)
    .is('deleted_at', null);
  existing = input.companyId
    ? existing.eq('company_id', input.companyId)
    : existing.is('company_id', null);
  const found = await existing.maybeSingle();
  if (found.error) throw new InternalError(found.error);
  let version: number;
  if (found.data) {
    if (input.version === null || Number(found.data.version) !== input.version)
      throw new ConflictError();
    const r = await admin
      .from('feature_flags')
      .update({ enabled: input.enabled, rollout_percent: input.rolloutPercent })
      .eq('id', String(found.data.id))
      .eq('version', input.version)
      .select('version');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
    version = Number(r.data[0]?.version ?? input.version + 1);
  } else {
    if (input.version !== null) throw new ConflictError();
    const r = await admin
      .from('feature_flags')
      .insert({
        key: input.key,
        company_id: input.companyId,
        enabled: input.enabled,
        rollout_percent: input.rolloutPercent,
      })
      .select('version')
      .single();
    if (r.error) {
      if (r.error.code === '23505') throw new ConflictError();
      throw new InternalError(r.error);
    }
    version = Number(r.data.version);
  }
  await getService('audit').record({
    action: 'flag.changed',
    resourceType: 'feature_flag',
    resourceId: null,
    companyId: input.companyId,
    metadata: {
      key: input.key,
      enabled: input.enabled,
      rolloutPercent: input.rolloutPercent,
      by: actor.userId,
    },
  });
  return { version };
}
