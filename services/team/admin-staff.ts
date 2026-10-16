// path: services/team/admin-staff.ts
// Platform staff (admin_staff) managed by the super admin: create an account with a sub-role, change the sub-role,
// plan weekly shifts (UTC), and tell who is on duty now. A new person gets no password from us: they set their own
// through a one-time link. Suspending or reactivating staff is done in the people screens (07.8).
import 'server-only';
import { getService, tryGetService } from '@/lib/container';
import {
  DuplicateError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { PASSWORD_RESET_TTL_SECONDS } from '@/config/auth-lock';
import { fromMinutes, toMinutes, type StaffAction } from '@/lib/company/ops-input';
import { isOnDuty, type ShiftView } from './admin-staff-duty';
import { getPublicEnv } from '@/lib/env/public';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomBase64Url, randomHex, sha256Hex } from '@/lib/utils/hash';
import { lookupUserByEmail } from '@/services/auth/credentials';
import { hashIdentifier } from '@/services/auth/lock-service';
import type { Actor } from '@/types/contracts';

export type { ShiftView };
export interface StaffView {
  userId: string;
  name: string;
  email: string;
  subRole: string | null;
  status: string;
  shifts: ShiftView[];
  onDuty: boolean;
}

function requireSuper(actor: Actor): void {
  if (actor.role !== 'super_admin')
    throw new ForbiddenError('Only the super admin manages admin staff.');
}

export async function listStaff(): Promise<StaffView[]> {
  const admin = getAdminSupabase();
  const profiles = await admin
    .from('profiles')
    .select('user_id, email, full_name, admin_sub_role, status')
    .eq('platform_role', 'admin_staff')
    .is('deleted_at', null)
    .order('email')
    .limit(200);
  if (profiles.error) throw new InternalError(profiles.error);
  const ids = (profiles.data ?? []).map((p) => String(p.user_id));
  const shifts =
    ids.length === 0
      ? { data: [], error: null }
      : await admin
          .from('admin_shifts')
          .select('user_id, weekday, start_minute, end_minute')
          .in('user_id', ids)
          .is('deleted_at', null)
          .order('weekday')
          .order('start_minute');
  if (shifts.error) throw new InternalError(shifts.error);
  const now = new Date();
  return (profiles.data ?? []).map((p) => {
    const own: ShiftView[] = (shifts.data ?? [])
      .filter((s) => String(s.user_id) === String(p.user_id))
      .map((s) => ({
        weekday: Number(s.weekday),
        start: fromMinutes(Number(s.start_minute)),
        end: fromMinutes(Number(s.end_minute)),
      }));
    return {
      userId: String(p.user_id),
      name: String(p.full_name),
      email: String(p.email),
      subRole: p.admin_sub_role ? String(p.admin_sub_role) : null,
      status: String(p.status),
      shifts: own,
      onDuty: String(p.status) === 'active' && isOnDuty(own, now),
    };
  });
}

/** User ids of active staff on duty now, optionally of one sub-role. Support routing uses this. */
export async function onDutyNow(subRole?: string): Promise<string[]> {
  return (await listStaff())
    .filter((s) => s.onDuty && (!subRole || s.subRole === subRole))
    .map((s) => s.userId);
}

async function sendSetPasswordLink(userId: string, email: string): Promise<void> {
  const identifier = await hashIdentifier(email);
  const token = randomBase64Url(32);
  const issued = await getAdminSupabase().rpc('kd_reset_token_issue', {
    p_identifier: identifier,
    p_user: userId,
    p_token_hash: await sha256Hex(token),
    p_ttl_seconds: PASSWORD_RESET_TTL_SECONDS,
  });
  if (issued.error) throw new InternalError(issued.error);
  if (issued.data !== true) throw new ValidationError('This account is locked. Try again later.');
  await tryGetService('email')?.send({
    template: 'auth.reset-password',
    to: email,
    companyId: null,
    data: {
      resetUrl: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/reset-password?i=${identifier}&t=${token}`,
    },
    idempotencyKey: `staff-welcome-${randomHex(16)}`,
  });
}

async function staffProfile(userId: string): Promise<{ email: string }> {
  const { data, error } = await getAdminSupabase()
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .eq('platform_role', 'admin_staff')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return { email: String(data.email) };
}

export async function runStaffAction(
  actor: Actor,
  input: StaffAction,
): Promise<{ result: 'done' }> {
  requireSuper(actor);
  const admin = getAdminSupabase();
  const record = (action: string, id: string, metadata: Record<string, unknown>): Promise<void> =>
    getService('audit').record({
      action,
      resourceType: 'user',
      resourceId: id,
      companyId: null,
      metadata: { ...metadata, by: actor.userId },
    });
  if (input.action === 'create') {
    if (await lookupUserByEmail(input.email))
      throw new DuplicateError('This address cannot be used.');
    // The random password is never shown or stored by us; the person sets their own through the link.
    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: randomBase64Url(36),
      email_confirm: true,
      app_metadata: { role: 'admin_staff', company_id: null },
    });
    if (created.error || !created.data.user)
      throw new DuplicateError('This address cannot be used.');
    const userId = created.data.user.id;
    const profile = await admin.from('profiles').insert({
      user_id: userId,
      email: input.email,
      full_name: input.fullName,
      platform_role: 'admin_staff',
      admin_sub_role: input.subRole,
    });
    if (profile.error) {
      await admin.auth.admin.deleteUser(userId);
      throw new InternalError(profile.error);
    }
    await sendSetPasswordLink(userId, input.email);
    await record('staff.created', userId, { subRole: input.subRole });
    return { result: 'done' };
  }
  const { email } = await staffProfile(input.userId);
  if (input.action === 'sub_role') {
    const r = await admin
      .from('profiles')
      .update({ admin_sub_role: input.subRole })
      .eq('user_id', input.userId);
    if (r.error) throw new InternalError(r.error);
    await record('staff.sub_role_changed', input.userId, { subRole: input.subRole });
  } else if (input.action === 'shifts') {
    const rows = input.shifts.map((s) => ({
      weekday: s.weekday,
      start: toMinutes(s.start),
      end: toMinutes(s.end),
    }));
    const r = await admin.rpc('kd_admin_shifts_replace', { p_user: input.userId, p_rows: rows });
    if (r.error) {
      if (r.error.code === '22023')
        throw new ValidationError('Two shifts on the same day overlap.');
      throw new InternalError(r.error);
    }
    await record('staff.shifts_changed', input.userId, { slots: rows.length });
  } else {
    await sendSetPasswordLink(input.userId, email);
    await record('staff.link_resent', input.userId, {});
  }
  return { result: 'done' };
}
