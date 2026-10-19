// path: services/wallet/fees.ts
// The fee schedule in force for a company: its own schedule when the platform team set one, otherwise the platform
// default, otherwise the built-in default. Only the platform team changes schedules; every change is audited by the
// table's audit trigger.
import 'server-only';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import {
  DEFAULT_FEE_SCHEDULE,
  feeScheduleSchema,
  type FeeSchedule,
} from '@/lib/payment/fee-calculator';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

async function load(companyId: string | null): Promise<FeeSchedule | null> {
  let q = getAdminSupabase().from('fee_schedules').select('model').is('deleted_at', null);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const parsed = feeScheduleSchema.safeParse(data.model);
  return parsed.success ? parsed.data : null;
}

export async function getFeeSchedule(
  companyId: string,
): Promise<{ schedule: FeeSchedule; source: 'company' | 'platform' | 'built_in' }> {
  const own = await load(companyId);
  if (own) return { schedule: own, source: 'company' };
  const platform = await load(null);
  if (platform) return { schedule: platform, source: 'platform' };
  return { schedule: DEFAULT_FEE_SCHEDULE, source: 'built_in' };
}

/** Sets the platform default (`companyId` null) or the schedule of one company. Super admin only. */
export async function saveFeeSchedule(
  actor: Actor,
  companyId: string | null,
  input: unknown,
): Promise<FeeSchedule> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const parsed = feeScheduleSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The fee schedule is not valid.');
  const admin = getAdminSupabase();
  let find = admin.from('fee_schedules').select('id').is('deleted_at', null);
  find = companyId ? find.eq('company_id', companyId) : find.is('company_id', null);
  const current = await find.maybeSingle();
  if (current.error) throw new InternalError(current.error);
  const written = current.data
    ? await admin
        .from('fee_schedules')
        .update({ model: parsed.data, updated_by: actor.userId })
        .eq('id', current.data.id)
    : await admin
        .from('fee_schedules')
        .insert({ company_id: companyId, model: parsed.data, updated_by: actor.userId });
  if (written.error) throw new InternalError(written.error);
  return parsed.data;
}

/** Removes the schedule of one company, so the platform default applies again. Super admin only. */
export async function clearCompanyFeeSchedule(actor: Actor, companyId: string): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const { error } = await getAdminSupabase()
    .from('fee_schedules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
}
