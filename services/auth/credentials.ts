// path: services/auth/credentials.ts
// Talks to Supabase Auth on behalf of the platform. The browser never sends a password to Supabase directly.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import { getServerEnv } from '@/lib/env';
import { getPublicEnv } from '@/lib/env/public';
import { InternalError } from '@/lib/errors';
import { normalizeIdentifier } from '@/lib/auth/lock';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Role } from '@/types/contracts';

const profileRow = z
  .object({
    user_id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    platform_role: z.enum(['super_admin', 'ceo', 'admin_staff']).nullable(),
    created_at: z.string(),
    status: z.enum(['active', 'disabled']),
  })
  .strip();

export interface KnownUser {
  userId: string;
  companyId: string | null;
  role: Role | null;
  createdAt: string;
  active: boolean;
}

/** Finds the profile for an e-mail address. Returns null for unknown addresses (callers behave the same either way). */
export async function lookupUserByEmail(email: string): Promise<KnownUser | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('profiles')
    .select('user_id, company_id, platform_role, created_at, status')
    .eq('email', normalizeIdentifier(email))
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const row = profileRow.parse(data);
  let role: Role | null = row.platform_role;
  if (!role && row.company_id) {
    const membership = await admin
      .from('memberships')
      .select('role')
      .eq('user_id', row.user_id)
      .eq('company_id', row.company_id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();
    if (membership.error) throw new InternalError(membership.error);
    role =
      membership.data?.role === 'owner' || membership.data?.role === 'staff'
        ? membership.data.role
        : null;
  }
  return {
    userId: row.user_id,
    companyId: row.company_id,
    role,
    createdAt: row.created_at,
    active: row.status === 'active',
  };
}

/**
 * Checks e-mail and password with Supabase Auth. The session that Supabase creates for the check is closed at once;
 * the real session is created later by mintSession, after the second factor.
 */
export type PasswordCheck = 'ok' | 'wrong' | 'unconfirmed';

/**
 * Checks the password with Supabase Auth. "unconfirmed" means the password is right but the e-mail address was never
 * confirmed (Supabase refuses to sign such an account in), so the caller can send a new confirmation link.
 */
export async function checkPassword(email: string, password: string): Promise<PasswordCheck> {
  const publicEnv = getPublicEnv();
  const client = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeIdentifier(email),
    password,
  });
  if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message ?? ''))
    return 'unconfirmed';
  if (error || !data.session) return 'wrong';
  await getAdminSupabase().auth.admin.signOut(data.session.access_token, 'local');
  return 'ok';
}

export async function verifyPassword(email: string, password: string): Promise<boolean> {
  return (await checkPassword(email, password)) === 'ok';
}

export interface MintedSession {
  userId: string;
  authSessionId: string | null;
}

/** Creates the real browser session (cookies are set through the request-bound server client). */
export async function mintSession(email: string): Promise<MintedSession> {
  const admin = getAdminSupabase();
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizeIdentifier(email),
  });
  if (link.error || !link.data.properties?.hashed_token) throw new InternalError(link.error);
  const client = await createServerSupabase();
  const verified = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'email',
  });
  if (verified.error || !verified.data.session || !verified.data.user)
    throw new InternalError(verified.error);
  const claims = decodeJwt(verified.data.session.access_token);
  return {
    userId: verified.data.user.id,
    authSessionId: typeof claims.session_id === 'string' ? claims.session_id : null,
  };
}

export async function hasActiveFactor(userId: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase()
    .from('two_factor_factors')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data !== null;
}

export function pepper(): string {
  return getServerEnv().HMAC_TOKEN_SECRET;
}

/** Profile lookup by user id (used after a provider sign-in, which identifies the user by provider subject). */
export async function lookupUserById(
  userId: string,
): Promise<(KnownUser & { email: string }) | null> {
  const { data, error } = await getAdminSupabase()
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const email = String(data.email);
  const user = await lookupUserByEmail(email);
  return user ? { ...user, email } : null;
}
