// path: services/auth/lock-alerts.ts
// Warning e-mail when a lock starts (REQ-LOCK 3). It goes to the account holder and, for a staff account, to the
// company owner. The e-mail never contains an unlock link.
import 'server-only';
import { tryGetService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';

interface Recipient {
  email: string;
  audience: 'account' | 'company_owner';
}

async function recipientsFor(userId: string, companyId: string | null): Promise<Recipient[]> {
  const admin = getAdminSupabase();
  const holder = await admin
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (holder.error) throw new InternalError(holder.error);
  const list: Recipient[] = holder.data?.email
    ? [{ email: String(holder.data.email), audience: 'account' }]
    : [];
  if (companyId) {
    const membership = await admin
      .from('memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (membership.error) throw new InternalError(membership.error);
    if (membership.data?.role === 'staff') {
      const owners = await admin
        .from('memberships')
        .select('user_id')
        .eq('company_id', companyId)
        .eq('role', 'owner')
        .eq('status', 'active')
        .is('deleted_at', null);
      if (owners.error) throw new InternalError(owners.error);
      for (const owner of owners.data ?? []) {
        const profile = await admin
          .from('profiles')
          .select('email')
          .eq('user_id', owner.user_id)
          .is('deleted_at', null)
          .maybeSingle();
        if (!profile.error && profile.data?.email)
          list.push({ email: String(profile.data.email), audience: 'company_owner' });
      }
    }
  }
  return list;
}

export async function notifyLockStarted(input: {
  userId: string;
  companyId: string | null;
  lockedUntil: string | null;
}): Promise<void> {
  const email = tryGetService('email');
  if (!email) return;
  for (const recipient of await recipientsFor(input.userId, input.companyId)) {
    await email.send({
      template: 'auth.account-locked',
      to: recipient.email,
      companyId: input.companyId,
      data: { audience: recipient.audience, lockedUntil: input.lockedUntil },
      idempotencyKey: `lock-${(await sha256Hex(`${input.userId}|${input.lockedUntil}|${recipient.email}`)).slice(0, 40)}`,
    });
  }
}
