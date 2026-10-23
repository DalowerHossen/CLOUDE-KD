// path: services/subscription/client-plans.ts
// The recurring plans a company sells to its own clients: name, price, billing interval (monthly or yearly), features
// shown to the client, a trial, and a price per extra seat. Changing a plan does not change what clients who already joined
// pay; archiving hides it from new subscriptions.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { clientPlanInput, clientPlanUpdate } from '@/lib/payment/client-subscription-rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface ClientPlanView {
  id: string;
  name: string;
  description: string;
  price: string;
  interval: 'month' | 'year';
  trialDays: number;
  features: string[];
  seatPrice: string;
  includedSeats: number;
  status: 'active' | 'archived';
  version: number;
}

export const PLAN_COLUMNS =
  'id, name, description, price, interval, trial_days, features, seat_price, included_seats, status, version';

export interface PlanRow {
  id: string;
  name: string;
  description: string;
  price: string | number;
  interval: 'month' | 'year';
  trial_days: number;
  features: string[];
  seat_price: string | number;
  included_seats: number;
  status: 'active' | 'archived';
  version: number;
}

export const toPlanView = (r: PlanRow): ClientPlanView => ({
  id: r.id,
  name: r.name,
  description: r.description,
  price: Money.parseRounded(String(r.price)).toDbString(),
  interval: r.interval,
  trialDays: r.trial_days,
  features: r.features,
  seatPrice: Money.parseRounded(String(r.seat_price)).toDbString(),
  includedSeats: r.included_seats,
  status: r.status,
  version: r.version,
});

async function requireManage(actor: Actor): Promise<string> {
  if (!actor.companyId) throw new ForbiddenError();
  if (
    !(await getService('permissions').can(actor, 'client_subscription.manage', {
      type: 'client_subscription_plan',
    }))
  )
    throw new ForbiddenError();
  return actor.companyId;
}

export async function listClientPlans(
  companyId: string,
  includeArchived = false,
): Promise<ClientPlanView[]> {
  let q = getAdminSupabase()
    .from('client_subscription_plans')
    .select(PLAN_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at');
  if (!includeArchived) q = q.eq('status', 'active');
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as PlanRow[]).map(toPlanView);
}

export async function getClientPlan(companyId: string, id: string): Promise<ClientPlanView> {
  const { data, error } = await getAdminSupabase()
    .from('client_subscription_plans')
    .select(PLAN_COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toPlanView(data as unknown as PlanRow);
}

export async function createClientPlan(actor: Actor, input: unknown): Promise<ClientPlanView> {
  const companyId = await requireManage(actor);
  const parsed = clientPlanInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The plan is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('client_subscription_plans')
    .insert({
      company_id: companyId,
      name: d.name,
      description: d.description,
      price: d.price,
      interval: d.interval,
      trial_days: d.trialDays,
      features: d.features,
      seat_price: d.seatPrice,
      included_seats: d.includedSeats,
      created_by: actor.userId,
    })
    .select(PLAN_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('You already have an active plan with this name.');
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'client_plan.created',
    resourceType: 'client_subscription_plan',
    resourceId: String(data.id),
    companyId,
    metadata: { name: d.name },
  });
  return toPlanView(data as unknown as PlanRow);
}

export async function updateClientPlan(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
): Promise<ClientPlanView> {
  const companyId = await requireManage(actor);
  const parsed = clientPlanUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description;
  if (d.price !== undefined) patch.price = d.price;
  if (d.trialDays !== undefined) patch.trial_days = d.trialDays;
  if (d.features !== undefined) patch.features = d.features;
  if (d.seatPrice !== undefined) patch.seat_price = d.seatPrice;
  if (d.includedSeats !== undefined) patch.included_seats = d.includedSeats;
  const { data, error } = await getAdminSupabase()
    .from('client_subscription_plans')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', version)
    .is('deleted_at', null)
    .select(PLAN_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('You already have an active plan with this name.');
    throw new InternalError(error);
  }
  if (!data) throw new ConflictError('The plan was changed by someone else. Reload and try again.');
  await getService('audit').record({
    action: 'client_plan.updated',
    resourceType: 'client_subscription_plan',
    resourceId: id,
    companyId,
    metadata: { fields: Object.keys(d) },
  });
  return toPlanView(data as unknown as PlanRow);
}

/** Hides a plan from new subscriptions. Clients already on it stay on it. */
export async function archiveClientPlan(actor: Actor, id: string): Promise<ClientPlanView> {
  const companyId = await requireManage(actor);
  const { data, error } = await getAdminSupabase()
    .from('client_subscription_plans')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .select(PLAN_COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  await getService('audit').record({
    action: 'client_plan.archived',
    resourceType: 'client_subscription_plan',
    resourceId: id,
    companyId,
    metadata: {},
  });
  return toPlanView(data as unknown as PlanRow);
}
