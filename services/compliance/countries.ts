// path: services/compliance/countries.ts
// Country restrictions: a platform admin switches a country on or off (usually after a United Nations Security Council measure).
// An enabled restriction in mode "block" refuses every request from that country at the network check; mode "review" does not
// refuse requests but makes KYC screening report a hit for a person from that country, so a reviewer decides. The platform does
// not read United Nations notices by itself: a person records the measure here (with its reference) and the switch does the rest.
import 'server-only';
import type { z } from 'zod';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';
import type { countryInput, countryPatch } from '@/lib/compliance/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface CountryRestrictionView {
  id: string;
  countryCode: string;
  mode: 'block' | 'review';
  source: 'un_security_council' | 'manual';
  reference: string;
  reason: string;
  enabled: boolean;
  version: number;
  updatedAt: string;
}

const COLUMNS = 'id, country_code, mode, source, reference, reason, enabled, version, updated_at';
const CACHE_MS = 30_000;
let cache: { at: number; block: string[]; review: string[] } | null = null;

function view(row: Record<string, unknown>): CountryRestrictionView {
  return {
    id: String(row.id),
    countryCode: String(row.country_code),
    mode: String(row.mode) as CountryRestrictionView['mode'],
    source: String(row.source) as CountryRestrictionView['source'],
    reference: String(row.reference),
    reason: String(row.reason),
    enabled: row.enabled === true,
    version: Number(row.version),
    updatedAt: String(row.updated_at),
  };
}

export async function listRestrictions(): Promise<CountryRestrictionView[]> {
  const { data, error } = await getAdminSupabase()
    .from('country_restrictions')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('country_code');
  if (error) throw new InternalError(error);
  return (data ?? []).map(view);
}

async function loaded(): Promise<{ block: string[]; review: string[] }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const rows = (await listRestrictions()).filter((r) => r.enabled);
  cache = {
    at: Date.now(),
    block: rows.filter((r) => r.mode === 'block').map((r) => r.countryCode),
    review: rows.filter((r) => r.mode === 'review').map((r) => r.countryCode),
  };
  return cache;
}

/** Countries whose requests are refused now. A failed read throws, so the caller fails closed. */
export async function blockedCountryCodes(): Promise<string[]> {
  return (await loaded()).block;
}

/** Countries that need a manual decision at KYC (and the blocked ones). */
export async function restrictedCountryCodes(): Promise<string[]> {
  const { block, review } = await loaded();
  return [...block, ...review];
}

async function written(
  actor: Actor,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  cache = null;
  await getService('audit').record({
    action,
    resourceType: 'country_restriction',
    resourceId: id,
    companyId: null,
    metadata: { ...metadata, by: actor.userId },
  });
}

export async function addRestriction(
  actor: Actor,
  input: z.infer<typeof countryInput>,
): Promise<CountryRestrictionView> {
  const { data, error } = await getAdminSupabase()
    .from('country_restrictions')
    .insert({
      country_code: input.countryCode,
      mode: input.mode,
      source: input.source,
      reference: input.reference,
      reason: input.reason,
      changed_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError();
    throw new InternalError(error);
  }
  await written(actor, 'compliance.country_added', String(data.id), {
    country: input.countryCode,
    mode: input.mode,
    source: input.source,
  });
  return view(data);
}

export async function changeRestriction(
  actor: Actor,
  id: string,
  input: z.infer<typeof countryPatch>,
): Promise<CountryRestrictionView> {
  const patch: Record<string, unknown> = { changed_by: actor.userId };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.mode !== undefined) patch.mode = input.mode;
  if (input.reason !== undefined) patch.reason = input.reason;
  if (input.reference !== undefined) patch.reference = input.reference;
  const { data, error } = await getAdminSupabase()
    .from('country_restrictions')
    .update(patch)
    .eq('id', id)
    .eq('version', input.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) {
    const exists = await getAdminSupabase()
      .from('country_restrictions')
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exists.error) throw new InternalError(exists.error);
    throw exists.data ? new ConflictError() : new NotFoundError();
  }
  const row = view(data[0] as Record<string, unknown>);
  await written(actor, 'compliance.country_changed', id, {
    country: row.countryCode,
    enabled: row.enabled,
    mode: row.mode,
  });
  return row;
}

export async function removeRestriction(actor: Actor, id: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('country_restrictions')
    .update({ deleted_at: new Date().toISOString(), changed_by: actor.userId })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, country_code');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await written(actor, 'compliance.country_removed', id, {
    country: String(data[0]?.country_code),
  });
}
