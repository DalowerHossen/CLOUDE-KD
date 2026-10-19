// path: services/mor/holds.ts
// Holds: the daily release, the platform team's manual release and extension, the automatic extension when risk
// shows up, and the list the owner sees with the reason of every hold. A hold is never released twice.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { addDays } from '@/lib/payment/mor-engine';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { releaseHold } from '@/services/wallet/ledger';
import type { Actor } from '@/types/contracts';
import { getMode } from './mode';
import { settlePending } from './settle';

const log = createLogger({ component: 'mor-holds' });

export interface HoldView {
  id: string;
  amount: string;
  reason: string;
  source: 'settlement' | 'manual' | 'risk';
  releaseAt: string;
  status: 'active' | 'released';
  releasedAt: string | null;
}

interface HoldRow {
  id: string;
  company_id: string;
  amount: string | number;
  reason: string;
  source: HoldView['source'];
  release_at: string;
  status: HoldView['status'];
  released_at: string | null;
}

const HOLD_COLUMNS = 'id, company_id, amount, reason, source, release_at, status, released_at';

const view = (r: HoldRow): HoldView => ({
  id: r.id,
  amount: Money.parseRounded(String(r.amount)).toDbString(),
  reason: r.reason,
  source: r.source,
  releaseAt: r.release_at,
  status: r.status,
  releasedAt: r.released_at,
});

/** The holds of a company, newest first, for the owner's wallet page. */
export async function listHolds(companyId: string, status?: 'active' | 'released'): Promise<HoldView[]> {
  let q = getAdminSupabase()
    .from('wallet_holds')
    .select(HOLD_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('release_at', { ascending: false })
    .limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as HoldRow[]).map(view);
}

/** Marks the settlement items of a released hold: released when no hold of the item is still active. */
async function markItemsReleased(holdId: string, now: Date): Promise<void> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('settlement_items')
    .select('id, hold_id, reserve_hold_id, status')
    .or(`hold_id.eq.${holdId},reserve_hold_id.eq.${holdId}`)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  for (const item of data ?? []) {
    if (item.status !== 'held') continue;
    const ids = [item.hold_id, item.reserve_hold_id].filter((v): v is string => Boolean(v));
    const { data: open, error: openError } = await admin
      .from('wallet_holds')
      .select('id')
      .in('id', ids)
      .eq('status', 'active');
    if (openError) throw new InternalError(openError);
    if ((open ?? []).length === 0) {
      const { error: upError } = await admin
        .from('settlement_items')
        .update({ status: 'released', released_at: now.toISOString() })
        .eq('id', item.id)
        .eq('status', 'held');
      if (upError) throw new InternalError(upError);
    }
  }
}

/** Releases every hold that is due. Run daily. Returns how many were released. */
export async function releaseDueHolds(now: Date = new Date()): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('wallet_holds')
    .select('id, company_id')
    .eq('status', 'active')
    .lte('release_at', now.toISOString())
    .is('deleted_at', null)
    .order('release_at')
    .limit(500);
  if (error) throw new InternalError(error);
  let released = 0;
  for (const h of data ?? []) {
    try {
      if (await releaseHold(String(h.company_id), String(h.id), null)) released += 1;
      await markItemsReleased(String(h.id), now);
    } catch (thrown) {
      log.error('hold not released', { holdId: String(h.id), error: String(thrown) });
    }
  }
  return released;
}

async function holdOf(holdId: string): Promise<HoldRow> {
  const { data, error } = await getAdminSupabase()
    .from('wallet_holds')
    .select(HOLD_COLUMNS)
    .eq('id', holdId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as HoldRow;
}

/** Releases a hold now. Super admin only; the reason is kept in the audit log. */
export async function releaseHoldNow(actor: Actor, holdId: string, reason: string): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const clean = reason.trim().slice(0, 300);
  if (clean.length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  const hold = await holdOf(holdId);
  const done = await releaseHold(hold.company_id, holdId, actor.userId);
  await markItemsReleased(holdId, new Date());
  if (done)
    await getService('audit').record({
      action: 'mor.hold_released',
      resourceType: 'wallet_hold',
      resourceId: holdId,
      companyId: hold.company_id,
      metadata: { reason: clean, amount: Money.parseRounded(String(hold.amount)).toDbString() },
    });
}

/** Moves the release time of an active hold later. Super admin only. */
export async function extendHold(actor: Actor, holdId: string, days: number, reason: string): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new ValidationError('Choose between 1 and 90 days.');
  const clean = reason.trim().slice(0, 300);
  if (clean.length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  await pushBack(await holdOf(holdId), days, clean, actor.userId);
}

async function pushBack(hold: HoldRow, days: number, reason: string, actorId: string | null): Promise<void> {
  if (hold.status !== 'active') throw new ValidationError('This hold was already released.');
  const releaseAt = addDays(new Date(hold.release_at), days);
  const { error } = await getAdminSupabase()
    .from('wallet_holds')
    .update({ release_at: releaseAt.toISOString(), reason: `${hold.reason} Extended by ${days} days: ${reason}`.slice(0, 300) })
    .eq('id', hold.id)
    .eq('status', 'active');
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'mor.hold_extended',
    resourceType: 'wallet_hold',
    resourceId: hold.id,
    companyId: hold.company_id,
    metadata: { days, reason, automatic: actorId === null },
  });
}

/** Risk found (a dispute opened): every active hold of the company waits longer, once per reason text (use the dispute id in it). */
export async function extendActiveHolds(companyId: string, reason: string): Promise<number> {
  const { rules } = await getMode(companyId);
  if (rules.riskExtensionDays <= 0) return 0;
  const holds = await listHolds(companyId, 'active');
  let moved = 0;
  for (const h of holds) {
    const { data } = await getAdminSupabase().from('wallet_holds').select(HOLD_COLUMNS).eq('id', h.id).maybeSingle();
    if (!data || String((data as HoldRow).reason).includes(reason)) continue; // this reason was already applied
    await pushBack(data as HoldRow, rules.riskExtensionDays, reason, null);
    moved += 1;
  }
  return moved;
}

/** Settles the payments that waited, for companies whose mode now allows it. Run with the daily release. */
export async function settleWaiting(): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_items')
    .select('company_id')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new InternalError(error);
  const companies = [...new Set((data ?? []).map((r) => String(r.company_id)))];
  let settled = 0;
  for (const companyId of companies) {
    const mode = await getMode(companyId);
    if (mode.mode === 'suspended') continue;
    settled += await settlePending(companyId);
  }
  return settled;
}
