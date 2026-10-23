// path: services/auth/password-service.ts
// Password rules on the server: policy, breach check, history of the last 5, and the update itself.
import 'server-only';
import { PASSWORD_HISTORY_DEPTH } from '@/config/auth-lock';
import { checkPassword, type PasswordRule } from '@/lib/auth/password';
import { ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError } from '@/lib/errors';
import { isDisposableEmail } from './disposable-emails';
import { breachCount, hashPasswordForHistory, isPasswordReused } from './password-hash';

const log = createLogger({ component: 'password-service' });

const RULE_TEXT: Record<PasswordRule, string> = {
  minLength: 'Use at least 12 characters.',
  maxLength: 'Use at most 128 characters.',
  upper: 'Add an upper case letter.',
  lower: 'Add a lower case letter.',
  digit: 'Add a digit.',
  special: 'Add a special character.',
  containsEmail: 'Do not use your e-mail address in the password.',
};

export function disposableCheck(email: string): void {
  if (isDisposableEmail(email)) {
    throw new ValidationError('Use a permanent e-mail address.', [
      { path: 'email', message: 'disposable' },
    ]);
  }
}

/** Policy plus breach check. Pass `userId` to also block the last 5 passwords. */
export async function enforcePasswordRules(
  password: string,
  email: string,
  userId?: string,
): Promise<void> {
  const result = checkPassword(password, email);
  if (!result.ok) {
    throw new ValidationError(
      'The password does not meet the rules.',
      result.failed.map((rule) => ({ path: 'password', message: RULE_TEXT[rule] })),
    );
  }
  const breaches = await breachCount(password);
  if (breaches === null) log.warn('breach check unavailable; continuing');
  if (breaches !== null && breaches > 0) {
    throw new ValidationError('This password appeared in a data breach. Choose another one.', [
      { path: 'password', message: 'breached' },
    ]);
  }
  if (userId) {
    const { data, error } = await getAdminSupabase()
      .from('password_history')
      .select('password_hash')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PASSWORD_HISTORY_DEPTH);
    if (error) throw new InternalError(error);
    if (
      await isPasswordReused(
        password,
        (data ?? []).map((r) => String(r.password_hash)),
      )
    ) {
      throw new ValidationError('You used this password recently. Choose a new one.', [
        { path: 'password', message: 'reused' },
      ]);
    }
  }
}

export async function rememberPassword(
  userId: string,
  companyId: string | null,
  password: string,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('password_history')
    .insert({
      user_id: userId,
      company_id: companyId,
      password_hash: await hashPasswordForHistory(password),
    });
  if (error) throw new InternalError(error);
}

/** Sets a new password at Supabase Auth, stores it in the history and ends every other session. */
export async function changePassword(
  userId: string,
  companyId: string | null,
  password: string,
  keepSessionId: string | null,
): Promise<void> {
  const admin = getAdminSupabase();
  const updated = await admin.auth.admin.updateUserById(userId, { password });
  if (updated.error) throw new InternalError(updated.error);
  await rememberPassword(userId, companyId, password);
  await admin.rpc('kd_revoke_user_sessions', {
    p_user: userId,
    p_except: keepSessionId,
    p_reason: 'password_changed',
  });
}
