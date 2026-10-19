// path: services/mor/settings.ts
// The rules for holding and settling payments. One platform row and optional rows per company; a missing value falls
// back to the platform value and then to the built-in value. Only the super admin changes them (every change is audited
// by the table trigger and by an audit entry).
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import {
  BUILT_IN_RULES,
  morSettingsInput,
  type MorRules,
  type MorSettingsInput,
} from '@/lib/payment/mor-engine';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

interface Row {
  id: string;
  company_id: string | null;
  enabled: boolean | null;
  suspended: boolean;
  suspended_reason: string | null;
  hold_days: number | null;
  new_merchant_hold_days: number | null;
  new_merchant_days: number | null;
  reserve_percent: string | number | null;
  reserve_days: number | null;
  cycle_days: number | null;
  daily_limit: string | number | null;
  large_payment: string | number | null;
  velocity_count: number | null;
  auto_suspend: boolean | null;
  risk_extension_days: number | null;
}

const COLUMNS =
  'id, company_id, enabled, suspended, suspended_reason, hold_days, new_merchant_hold_days, new_merchant_days, reserve_percent, reserve_days, cycle_days, daily_limit, large_payment, velocity_count, auto_suspend, risk_extension_days';

async function rowFor(companyId: string | null): Promise<Row | null> {
  let q = getAdminSupabase().from('mor_settings').select(COLUMNS).is('deleted_at', null);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  return (data as Row | null) ?? null;
}

const text = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

export interface ResolvedSettings {
  rules: MorRules;
  suspended: boolean;
  suspendedReason: string | null;
}

function pick<T>(own: T | null | undefined, platform: T | null | undefined, builtIn: T): T {
  return own ?? platform ?? builtIn;
}

export async function loadSettings(companyId: string): Promise<ResolvedSettings> {
  const [own, platform] = await Promise.all([rowFor(companyId), rowFor(null)]);
  const b = BUILT_IN_RULES;
  const cycle = pick(own?.cycle_days, platform?.cycle_days, b.cycleDays);
  const rules: MorRules = {
    // The platform switch is the platform row only; the company switch is the company row, on unless switched off.
    platformEnabled: platform?.enabled ?? b.platformEnabled,
    companyEnabled: own?.enabled ?? b.companyEnabled,
    holdDays: pick(own?.hold_days, platform?.hold_days, b.holdDays),
    newMerchantHoldDays: pick(own?.new_merchant_hold_days, platform?.new_merchant_hold_days, b.newMerchantHoldDays),
    newMerchantDays: pick(own?.new_merchant_days, platform?.new_merchant_days, b.newMerchantDays),
    reservePercent: pick(text(own?.reserve_percent), text(platform?.reserve_percent), b.reservePercent),
    reserveDays: pick(own?.reserve_days, platform?.reserve_days, b.reserveDays),
    cycleDays: cycle === 3 || cycle === 7 ? cycle : 1,
    dailyLimit: pick(text(own?.daily_limit), text(platform?.daily_limit), b.dailyLimit),
    largePayment: pick(text(own?.large_payment), text(platform?.large_payment), b.largePayment),
    velocityCount: pick(own?.velocity_count, platform?.velocity_count, b.velocityCount),
    autoSuspend: pick(own?.auto_suspend, platform?.auto_suspend, b.autoSuspend),
    riskExtensionDays: pick(own?.risk_extension_days, platform?.risk_extension_days, b.riskExtensionDays),
  };
  return { rules, suspended: own?.suspended ?? false, suspendedReason: own?.suspended_reason ?? null };
}

const COLUMN_OF: Record<keyof MorSettingsInput, string> = {
  enabled: 'enabled',
  holdDays: 'hold_days',
  newMerchantHoldDays: 'new_merchant_hold_days',
  newMerchantDays: 'new_merchant_days',
  reservePercent: 'reserve_percent',
  reserveDays: 'reserve_days',
  cycleDays: 'cycle_days',
  dailyLimit: 'daily_limit',
  largePayment: 'large_payment',
  velocityCount: 'velocity_count',
  autoSuspend: 'auto_suspend',
  riskExtensionDays: 'risk_extension_days',
};

const TEXT_COLUMNS = new Set(['reserve_percent', 'daily_limit', 'large_payment']);

/** The values saved for the platform (`companyId` null) or one company, as saved (null means "inherit"). */
export async function readOverrides(companyId: string | null): Promise<MorSettingsInput> {
  const row = await rowFor(companyId);
  const out: Record<string, unknown> = {};
  if (!row) return out;
  const source = row as unknown as Record<string, unknown>;
  for (const [key, column] of Object.entries(COLUMN_OF)) {
    const v = source[column];
    if (v === null || v === undefined) continue;
    out[key] = TEXT_COLUMNS.has(column) ? String(v) : v;
  }
  return out as MorSettingsInput;
}

/** Saves settings for the platform (`companyId` null) or one company. Super admin only. */
export async function saveSettings(actor: Actor, companyId: string | null, input: unknown): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const parsed = morSettingsInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const patch: Record<string, unknown> = { updated_by: actor.userId };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[COLUMN_OF[key as keyof MorSettingsInput]] = value;
  }
  const current = await rowFor(companyId);
  const admin = getAdminSupabase();
  const written = current
    ? await admin.from('mor_settings').update(patch).eq('id', current.id)
    : await admin.from('mor_settings').insert({ ...patch, company_id: companyId });
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'mor.settings_saved',
    resourceType: 'mor_settings',
    resourceId: current?.id ?? null,
    companyId,
    metadata: { fields: Object.keys(parsed.data) },
  });
}

/** Pauses settlement for a company (a person or the risk rules). Existing holds stay. */
export async function suspendCompany(actorId: string | null, companyId: string, reason: string): Promise<void> {
  const clean = reason.trim().slice(0, 300);
  if (clean.length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  const admin = getAdminSupabase();
  const current = await rowFor(companyId);
  const patch = {
    suspended: true,
    suspended_reason: clean,
    suspended_at: new Date().toISOString(),
    updated_by: actorId,
  };
  const written = current
    ? await admin.from('mor_settings').update(patch).eq('id', current.id)
    : await admin.from('mor_settings').insert({ ...patch, company_id: companyId });
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'mor.suspended',
    resourceType: 'mor_settings',
    resourceId: current?.id ?? null,
    companyId,
    metadata: { reason: clean, automatic: actorId === null },
  });
}

/** Starts settlement again after a review. */
export async function reinstateCompany(actor: Actor, companyId: string): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const current = await rowFor(companyId);
  if (!current?.suspended) return;
  const { error } = await getAdminSupabase()
    .from('mor_settings')
    .update({ suspended: false, suspended_reason: null, suspended_at: null, updated_by: actor.userId })
    .eq('id', current.id);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'mor.reinstated',
    resourceType: 'mor_settings',
    resourceId: current.id,
    companyId,
    metadata: {},
  });
}
