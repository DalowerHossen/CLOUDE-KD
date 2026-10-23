// path: services/team/members.ts
// Staff of a company: list, seat count, permission changes, deactivate, reactivate, remove, and the activity view.
// Only memberships with the role "staff" of the owner's own company can be changed; owners are never touched here.
// A staff member can never reach these functions (the routes need team.manage or team.permissions, owner only).
import 'server-only';
import { z } from 'zod';
import { permissions as registered } from '@/config/permissions';
import { getService, tryGetService } from '@/lib/container';
import { validateStaffGrants } from '@/lib/auth/permissions';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { planKeyOf } from '@/services/company/plan';
import { PLANS } from '@/config/plans';
import type { Actor } from '@/types/contracts';

export const grantsSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().min(1),
    grants: z.array(z.string().max(100)).max(200),
  })
  .strict();
export const statusSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().min(1),
    status: z.enum(['active', 'suspended', 'removed']),
  })
  .strict();

export interface MemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  status: string;
  grants: string[];
  version: number;
  joinedAt: string;
}

export async function listMembers(companyId: string): Promise<MemberView[]> {
  const admin = getAdminSupabase();
  const m = await admin
    .from('memberships')
    .select('id, user_id, role, status, granted_permissions, version, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at');
  if (m.error) throw new InternalError(m.error);
  const ids = (m.data ?? []).map((r) => String(r.user_id));
  const p = ids.length
    ? await admin
        .from('profiles')
        .select('user_id, email, full_name')
        .eq('company_id', companyId)
        .in('user_id', ids)
        .is('deleted_at', null)
    : { data: [], error: null };
  if (p.error) throw new InternalError(p.error);
  const profile = new Map((p.data ?? []).map((r) => [String(r.user_id), r]));
  return (m.data ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    name: String(profile.get(String(r.user_id))?.full_name ?? ''),
    email: String(profile.get(String(r.user_id))?.email ?? ''),
    role: r.role === 'owner' ? 'owner' : 'staff',
    status: String(r.status),
    grants: (r.granted_permissions as string[]) ?? [],
    version: Number(r.version),
    joinedAt: String(r.created_at),
  }));
}

export interface SeatState {
  used: number;
  /** Null means unlimited. */
  limit: number | null;
  invited: number;
}

/** Seats in use: the owner and every active staff member, plus invitations that are still open. */
export async function seatState(companyId: string): Promise<SeatState> {
  const admin = getAdminSupabase();
  const [m, i] = await Promise.all([
    admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'active')
      .is('deleted_at', null),
    admin
      .from('team_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .is('deleted_at', null),
  ]);
  if (m.error) throw new InternalError(m.error);
  if (i.error) throw new InternalError(i.error);
  const service = tryGetService('entitlement');
  const limit = service
    ? await service.limit(companyId, 'staff.seats')
    : PLANS[await planKeyOf(companyId)].entitlements['staff.seats'];
  return {
    used: (m.count ?? 0) + (i.count ?? 0),
    limit: typeof limit === 'number' ? limit : null,
    invited: i.count ?? 0,
  };
}

async function staffMembership(
  companyId: string,
  id: string,
): Promise<{ id: string; userId: string; version: number; status: string; grants: string[] }> {
  const { data, error } = await getAdminSupabase()
    .from('memberships')
    .select('id, user_id, role, status, version, granted_permissions')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('role', 'staff')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return {
    id: String(data.id),
    userId: String(data.user_id),
    version: Number(data.version),
    status: String(data.status),
    grants: (data.granted_permissions as string[]) ?? [],
  };
}

export async function updateGrants(
  actor: Actor,
  input: z.infer<typeof grantsSchema>,
): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId || actor.role !== 'owner') throw new NotFoundError();
  const target = await staffMembership(companyId, input.id);
  const grants = [...new Set(input.grants)].sort();
  const check = validateStaffGrants(grants, registered);
  if (!check.ok)
    throw new ValidationError(
      'Some permissions cannot be given to staff.',
      check.rejected.map((g) => ({ path: 'grants', message: g })),
    );
  const { data, error } = await getAdminSupabase()
    .from('memberships')
    .update({ granted_permissions: grants })
    .eq('id', target.id)
    .eq('version', input.expectedVersion)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  const before = new Set(target.grants);
  await getService('audit').record({
    action: 'team.permissions_changed',
    resourceType: 'membership',
    resourceId: target.id,
    companyId,
    metadata: {
      by: actor.userId,
      staff: target.userId,
      added: grants.filter((g) => !before.has(g)),
      removed: target.grants.filter((g) => !grants.includes(g)),
    },
  });
  await getService('notification')
    .notify({
      userId: target.userId,
      companyId,
      type: 'team.permissions',
      title: 'Your permissions changed',
      body: 'The owner changed what you can do.',
    })
    .catch(() => undefined);
}

export async function setStatus(actor: Actor, input: z.infer<typeof statusSchema>): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId || actor.role !== 'owner') throw new NotFoundError();
  const target = await staffMembership(companyId, input.id);
  if (input.status === 'active' && target.status !== 'active') {
    const seats = await seatState(companyId);
    if (seats.limit !== null && seats.used >= seats.limit)
      throw new ValidationError('Your plan has no free seat.');
  }
  const patch =
    input.status === 'removed'
      ? { status: 'suspended', deleted_at: new Date().toISOString() }
      : { status: input.status };
  const { data, error } = await getAdminSupabase()
    .from('memberships')
    .update(patch)
    .eq('id', target.id)
    .eq('version', input.expectedVersion)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  if (input.status !== 'active') {
    // Access ends at once: every open session of the person is closed.
    await getAdminSupabase().rpc('kd_revoke_user_sessions', {
      p_user: target.userId,
      p_except: null,
      p_reason: `staff_${input.status}`,
    });
  }
  await getService('audit').record({
    action: `team.staff_${input.status === 'suspended' ? 'deactivated' : input.status === 'active' ? 'reactivated' : 'removed'}`,
    resourceType: 'membership',
    resourceId: target.id,
    companyId,
    metadata: { by: actor.userId, staff: target.userId },
  });
}

export interface ActivityItem {
  at: string;
  action: string;
  resourceType: string;
}

/** Recent actions of one staff member, from the audit log of the company. */
export async function memberActivity(companyId: string, userId: string): Promise<ActivityItem[]> {
  const { data, error } = await getAdminSupabase()
    .from('audit_logs')
    .select('created_at, action, resource_type')
    .eq('company_id', companyId)
    .eq('actor_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    at: String(r.created_at),
    action: String(r.action),
    resourceType: String(r.resource_type),
  }));
}
