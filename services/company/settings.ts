// path: services/company/settings.ts
// Reads and writes tenant settings sections (company_settings). Other STEPs read a section through getSection.
// A write is validated by the strict section schema, locked by the version number and audited.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  SECTION_DEFAULTS,
  SECTION_SCHEMAS,
  type SectionKey,
  type SectionValue,
} from '@/lib/company/sections';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'company-settings' });

export interface LoadedSection<K extends SectionKey> {
  value: SectionValue<K>;
  /** 0 when nothing is stored yet (the defaults are shown). */
  version: number;
}

export async function getSection<K extends SectionKey>(
  companyId: string,
  key: K,
): Promise<LoadedSection<K>> {
  const { data, error } = await getAdminSupabase()
    .from('company_settings')
    .select('value, version')
    .eq('company_id', companyId)
    .eq('section', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const defaults = SECTION_DEFAULTS[key];
  if (!data) return { value: defaults, version: 0 };
  const merged = SECTION_SCHEMAS[key].safeParse({
    ...defaults,
    ...(data.value as Record<string, unknown>),
  });
  if (!merged.success) {
    log.error('stored settings are not valid; defaults are shown', { key });
    return { value: defaults, version: Number(data.version) };
  }
  return { value: merged.data as SectionValue<K>, version: Number(data.version) };
}

/** Saves a whole section. `expectedVersion` is what the editor loaded (0 when nothing was stored). */
export async function saveSection<K extends SectionKey>(
  actor: Actor,
  key: K,
  input: unknown,
  expectedVersion: number,
): Promise<LoadedSection<K>> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const parsed = SECTION_SCHEMAS[key].safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'A value is not valid.',
      parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  const { data, error } = await getAdminSupabase().rpc('kd_company_setting_save', {
    p_company: actor.companyId,
    p_section: key,
    p_value: parsed.data,
    p_expected: expectedVersion,
    p_user: actor.userId,
  });
  if (error) {
    if (error.code === '40001') throw new ConflictError();
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'company.settings_saved',
    resourceType: 'company_settings',
    resourceId: null,
    companyId: actor.companyId,
    metadata: { section: key, version: Number(data), by: actor.userId },
  });
  return { value: parsed.data as SectionValue<K>, version: Number(data) };
}

/** Records a milestone once and tells the owner about it. Safe to call again. */
export async function recordMilestone(companyId: string, milestone: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_milestone_record', {
    p_company: companyId,
    p_milestone: milestone,
  });
  if (error) throw new InternalError(error);
  return data === true;
}

export async function listMilestones(
  companyId: string,
): Promise<{ milestone: string; achievedAt: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('company_milestones')
    .select('milestone, achieved_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('achieved_at');
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    milestone: String(r.milestone),
    achievedAt: String(r.achieved_at),
  }));
}
