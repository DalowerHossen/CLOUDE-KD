// path: services/auth/session-ops.ts
// Sign-out of the current device or of every device. Safe to call without a session.
import 'server-only';
import { decodeJwt } from 'jose';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { hashIdentifier } from './lock-service';
import { recordLoginEvent } from './login-events';

export async function signOutCurrent(everywhere: boolean): Promise<{ signedOut: boolean }> {
  const client = await createServerSupabase();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  const user = data.session?.user;
  if (!token || !user) return { signedOut: true };
  const claims = decodeJwt(token);
  const authSessionId = typeof claims.session_id === 'string' ? claims.session_id : null;
  const admin = getAdminSupabase();
  if (everywhere) {
    await admin.rpc('kd_revoke_user_sessions', {
      p_user: user.id,
      p_except: null,
      p_reason: 'logout_all',
    });
  } else if (authSessionId) {
    await admin
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString(), revoke_reason: 'logout' })
      .eq('auth_session_id', authSessionId);
  }
  await client.auth.signOut({ scope: everywhere ? 'global' : 'local' });
  if (user.email) {
    await recordLoginEvent({
      identifierHash: await hashIdentifier(user.email),
      type: everywhere ? 'logout_all' : 'logout',
      userId: user.id,
    });
  }
  return { signedOut: true };
}
